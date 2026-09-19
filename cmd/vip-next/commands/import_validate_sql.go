package commands

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/sqlvalidation"
)

// ImportValidateSQLCmd returns `vip import validate-sql <FILE>`.
//
// Node parity: src/bin/vip-import-validate-sql.js (24 lines) →
// src/lib/validations/sql.ts validate(). Local-only: no GraphQL, no
// appctx middleware. validate() runs with isImport=false and
// skipChecks=DEV_ENV_SPECIFIC_CHECKS (useStatement + siteHomeUrlLando),
// matching what we register in internal/sqlvalidation.
func ImportValidateSQLCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "validate-sql <FILE>",
		Short: "Scan a SQL dump for VIP Platform compatibility issues",
		Long: "Scan a local SQL file for syntactically valid but platform-incompatible statements " +
			"(e.g. DROP DATABASE, TRIGGER, ALTER USER, non-InnoDB ENGINE) plus detect whether the " +
			"dump is from a WordPress multisite installation.\n\n" +
			"Mirrors Node's `vip import validate-sql` (src/lib/validations/sql.ts). Compressed " +
			"files (gzip, zip — detected from the file's contents, not its name) are not " +
			"supported; extract first and re-run.",
		Args: cobra.ExactArgs(1),
		RunE: runImportValidateSQL,
	}
}

// Magic numbers Node checks for in detectCompressedMimeType
// (src/lib/client-file-uploader.ts:458-476).
var (
	zipMagic  = []byte{0x50, 0x4b, 0x03, 0x04} // "PK\x03\x04"
	gzipMagic = []byte{0x1f, 0x8b}
)

// detectCompressedMimeType ports Node's detectCompressedMimeType: read the
// first 4 bytes of the file and match them against the zip / gzip magic
// numbers. Returns "application/zip", "application/gzip", or "".
//
// Node reads into a zero-filled 4-byte buffer, so a file shorter than the
// prefix cannot accidentally match (a lone 0x1f hexes to "1f000000").
// Reading fewer than len(magic) bytes here has the same effect.
func detectCompressedMimeType(path string) string {
	f, err := os.Open(path) // #nosec G304 -- path is a user-supplied CLI arg
	if err != nil {
		// Node throws here; we defer to the caller's os.Open so the user
		// gets the Node-parity "missing or not readable" message instead.
		return ""
	}
	defer f.Close()

	var header [4]byte
	n, err := io.ReadFull(f, header[:])
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return ""
	}
	got := header[:n]

	if bytes.HasPrefix(got, zipMagic) {
		return "application/zip"
	}
	if bytes.HasPrefix(got, gzipMagic) {
		return "application/gzip"
	}
	return ""
}

// fileMetaIsCompressed ports the isCompressed field of Node's getFileMeta
// (client-file-uploader.ts:153):
//
//	const isCompressed = [ 'application/zip', 'application/gzip' ].includes( mimeType );
//
// Detection is by MAGIC BYTES, never by extension. Extension sniffing was
// wrong both ways: it validated raw gzip bytes as if they were SQL whenever
// the file wasn't named .gz, and it refused to validate a plain SQL file
// that merely happened to be named .gz.
func fileMetaIsCompressed(path string) bool {
	switch detectCompressedMimeType(path) {
	case "application/zip", "application/gzip":
		return true
	}
	return false
}

func runImportValidateSQL(cmd *cobra.Command, args []string) error {
	path := args[0]
	trackEvent("import_validate_sql_command_execute", map[string]any{"is_import": false})

	if fileMetaIsCompressed(path) {
		err := errors.New("Compressed files cannot be validated. Please extract the archive and re-run the command, providing the path to the extracted SQL file.")
		trackEvent("import_validate_sql_command_error", map[string]any{"error": "compressed"})
		return err
	}

	f, err := os.Open(path) // #nosec G304 -- path is a user-supplied CLI arg
	if err != nil {
		// Node parity: getReadInterface() wraps any open failure with a
		// generic missing/unreadable message — see line-by-line.ts:29.
		trackEvent("import_validate_sql_command_error", map[string]any{"error": "open"})
		return errors.New("The file at the provided path is either missing or not readable. Please check the input and try again.")
	}
	defer f.Close()

	res, err := sqlvalidation.Validate(f)
	if err != nil {
		trackEvent("import_validate_sql_command_error", map[string]any{"error": err.Error()})
		return err
	}

	failureReport, problems, errorSummary := renderValidationReport(cmd.OutOrStdout(), res)

	// Node parity (src/lib/validations/sql.ts::validate): when problemsFound
	// > 0, Node calls exit.withError which exits 1. Mirror that so CI
	// pipelines using `vip import validate-sql && deploy` short-circuit on
	// findings. Zero findings -> exit 0.
	if problems > 0 {
		trackEvent("import_validate_sql_command_failure", map[string]any{
			"is_import": false,
			"error":     errorSummary,
		})
		return errors.New(failureReport)
	}
	trackEvent("import_validate_sql_command_success", map[string]any{"is_import": false})
	return nil
}

// renderValidationReport prints the stdout portion of Node's validate-sql
// output and returns the failure report for the shared stderr exit path:
//
//   - "Finished processing N lines." + blank line (Node sql.ts:413-415,
//     only when isImport === false; validate-sql always is).
//   - For each registered check: errors / warnings / infos via the
//     check's formatter. Order matches insertion order.
//   - Duplicate table-name detection (sql.ts:442-456).
//   - Warning block (none for validate-sql since the only warning-producing
//     check is the skipped siteHomeUrlLando, but mirroring the flow keeps
//     the code aligned with Node).
//   - Error block + bold-red "SQL validation failed due to N error(s)"
//     footer returned as one error string, so exit.withError places the whole
//     report on stderr.
//   - Info block on success.
func renderValidationReport(w io.Writer, res *sqlvalidation.Result) (failureReport string, problems int, errorSummary map[string]int) {
	// Node parity: src/lib/validations/sql.ts:413 emits log("Finished
	// processing N lines.") + log("\n"). Both Node `log` calls add their
	// own \n, producing TWO newlines total after the header (the literal
	// "\n" string + log's trailing newline). One Fprintln here equals
	// one extra blank line, matching Node exactly.
	fmt.Fprintf(w, "Finished processing %d lines.\n", res.LinesProcessed)
	fmt.Fprintln(w)

	var errLines []string
	var warnLines []string
	var infoLines []string
	errorSummary = make(map[string]int, len(res.Checks)+1)

	for _, check := range res.Checks {
		errs, warns, infos, p := formatCheck(check, false)
		errLines = append(errLines, errs...)
		warnLines = append(warnLines, warns...)
		infoLines = append(infoLines, infos...)
		problems += p
		errorSummary[check.Key] = len(check.Results)
	}
	// Node builds this summary before its separate duplicate-table check, so
	// preserve that ordering even though the final failure count can be one
	// higher when duplicate table names are the only finding.
	errorSummary["problems_found"] = problems

	// Duplicate table-name detection — Node sql.ts:442.
	if dups := findDuplicateTables(res.TableNames); len(dups) > 0 {
		problems++
		errLines = append(errLines,
			formatErrorLine("Duplicate table names were found: "+strings.Join(dups, ",")),
			formatRecLine("Ensure that there are no duplicate tables in your SQL dump"),
			"",
		)
	}

	if len(warnLines) > 0 {
		fmt.Fprintln(w, strings.Join(warnLines, "\n"))
		fmt.Fprintln(w)
	}

	if problems > 0 {
		// Node sql.ts:489: errorOutput joined with "\n", then bold red footer.
		errLines = append(errLines, color.New(color.FgRed, color.Bold).Sprint(
			"SQL validation failed due to "+strconv.Itoa(problems)+" error(s)"))
		return strings.Join(errLines, "\n"), problems, errorSummary
	}

	// Success path: dump infos.
	fmt.Fprintln(w, strings.Join(infoLines, "\n"))
	fmt.Fprintln(w)

	return "", 0, errorSummary
}

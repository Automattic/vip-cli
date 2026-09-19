package commands

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/fatih/color"

	"github.com/Automattic/vip/internal/sqlvalidation"
)

// Shared SQL-validation report formatting, used by `vip import
// validate-sql` (isImport=false) and `vip import sql`'s preflight
// validation (isImport=true). Mirrors the three Node formatters in
// src/lib/validations/sql.ts plus postValidation's error assembly.

// wpMultisitePrefixPattern matches `wp_<digits>_*` table names — used by
// the createTable sub-classifier to count multisite tables. Mirrors Node
// sql.ts:223's /^wp_(\d+_)/. The Node regex's capture group is dropped
// here because we only need the boolean match (we never read the capture).
var wpMultisitePrefixPattern = regexp.MustCompile(`^wp_\d+_`)

// formatCheck returns (errors, warnings, infos, problemsAdded) for one
// check. Mirrors the three Node formatters:
//
//	lineNumberCheckFormatter — has results: emit error; otherwise emit
//	  "✅ <message> was found 0 times." info.
//	requiredCheckFormatter   — inverted: 0 results emits error; otherwise
//	  "✅ <message> was found N times." info. createTable additionally
//	  runs the wp_ prefix sub-classifier — but ONLY when !isImport
//	  (sql.ts:184).
//	infoCheckFormatter       — push every result.Text as an info; never
//	  emits errors.
func formatCheck(c *sqlvalidation.Check, isImport bool) (errs, warns, infos []string, problems int) {
	switch c.Formatter {
	case sqlvalidation.FormatterLineNumber:
		if len(c.Results) == 0 {
			infos = append(infos, "✅ "+c.Message+" was found 0 times.")
			return
		}
		problems = 1
		lines := make([]string, len(c.Results))
		for i, r := range c.Results {
			lines[i] = strconv.Itoa(r.Line)
		}
		errs = append(errs,
			formatErrorLine(c.Message+" on line(s) "+strings.Join(lines, ", ")+"."),
			formatRecLine(c.Recommendation),
			"",
		)
		return

	case sqlvalidation.FormatterRequired:
		if len(c.Results) == 0 {
			problems = 1
			errs = append(errs,
				formatErrorLine(c.Message+" was not found."),
				formatRecLine(c.Recommendation),
				"",
			)
			return
		}
		infos = append(infos, fmt.Sprintf("✅ %s was found %d times.", c.Message, len(c.Results)))
		if c.Key == "createTable" && !isImport {
			// Node sql.ts:182 — wp_ prefix sub-classifier runs only in
			// standalone validate mode.
			extraErrs, extraInfos, addedProblems := checkTablePrefixes(c.Results)
			errs = append(errs, extraErrs...)
			infos = append(infos, extraInfos...)
			problems += addedProblems
		}
		return

	case sqlvalidation.FormatterInfo:
		for _, r := range c.Results {
			if r.Text != "" {
				infos = append(infos, r.Text)
			}
		}
		return
	}
	return
}

// checkTablePrefixes is Node sql.ts:217's checkTablePrefixes — classifies
// captured CREATE TABLE names into wp_ / wp_<n>_ / non-wp_ buckets. Only
// the non-wp_ bucket produces an error.
func checkTablePrefixes(results []sqlvalidation.CheckResult) (errs, infos []string, problems int) {
	var wpTables, notWPTables, wpMultisiteTables []string
	for _, r := range results {
		name := r.Text
		switch {
		case wpMultisitePrefixPattern.MatchString(name):
			wpMultisiteTables = append(wpMultisiteTables, name)
		case strings.HasPrefix(name, "wp_"):
			wpTables = append(wpTables, name)
		default:
			notWPTables = append(notWPTables, name)
		}
	}
	if len(wpTables) > 0 {
		infos = append(infos, fmt.Sprintf(" - wp_ prefix tables found: %d ", len(wpTables)))
	}
	if len(notWPTables) > 0 {
		problems = 1
		errs = append(errs,
			formatErrorLine("tables without wp_ prefix found: "+strings.Join(notWPTables, ",")),
			formatRecLine("Please make sure all table names are prefixed with `wp_`"),
			"",
		)
	}
	if len(wpMultisiteTables) > 0 {
		infos = append(infos, fmt.Sprintf(" - wp_n_ prefix tables found: %d ", len(wpMultisiteTables)))
	}
	return
}

// findDuplicateTables returns the unique table names that appear more
// than once in the input. Mirrors Node sql.ts:396's findDuplicates flow:
// Node walks a set, deleting entries on first sighting and pushing on
// re-sighting, then de-dupes with `new Set([...])`.
func findDuplicateTables(tableNames []string) []string {
	seen := map[string]bool{}
	for _, name := range tableNames {
		seen[name] = true
	}
	if len(tableNames) == len(seen) {
		return nil
	}
	counts := map[string]int{}
	for _, name := range tableNames {
		counts[name]++
	}
	out := []string{}
	emitted := map[string]bool{}
	for _, name := range tableNames {
		if counts[name] > 1 && !emitted[name] {
			out = append(out, name)
			emitted[name] = true
		}
	}
	return out
}

// formatErrorLine and formatRecLine mirror the chalk color wrappers in
// Node sql.ts:19-29.
func formatErrorLine(msg string) string {
	return color.RedString("SQL Error:") + " " + msg
}

func formatRecLine(msg string) string {
	return color.YellowString("Recommendation:") + " " + msg
}

// buildImportValidationError mirrors postValidation with isImport=true
// (sql.ts:409,494): collect error lines + the bold-red footer into a
// single string the import command surfaces via the thrown-error path.
// Returns ("", 0) when the file is clean.
func buildImportValidationError(res *sqlvalidation.Result) (string, int) {
	var errLines []string
	problems := 0
	for _, check := range res.Checks {
		errs, _, _, p := formatCheck(check, true)
		errLines = append(errLines, errs...)
		problems += p
	}
	if dups := findDuplicateTables(res.TableNames); len(dups) > 0 {
		problems++
		errLines = append(errLines,
			formatErrorLine("Duplicate table names were found: "+strings.Join(dups, ",")),
			formatRecLine("Ensure that there are no duplicate tables in your SQL dump"),
			"",
		)
	}
	if problems == 0 {
		return "", 0
	}
	errLines = append(errLines, color.New(color.FgRed, color.Bold).Sprint(
		"SQL validation failed due to "+strconv.Itoa(problems)+" error(s)"))
	return strings.Join(errLines, "\n"), problems
}

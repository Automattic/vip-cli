package commands

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Khan/genqlient/graphql"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/searchreplace"
	"github.com/Automattic/vip/internal/siteimport"
	"github.com/Automattic/vip/internal/sqlvalidation"
	"github.com/Automattic/vip/internal/tui"
	"github.com/Automattic/vip/internal/upload"
)

// ImportSQLCmd returns `vip import sql <file|url>`.
//
// Node parity: src/bin/vip-import-sql.js (852 LOC). Flow: gates →
// (local) SQL validation → playbook → type-the-domain confirm →
// optional skip-backup double confirm → optional in-place confirm →
// progress phase (search-replace, upload / URL passthrough,
// StartImport mutation) → status polling (internal/siteimport).
func ImportSQLCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "sql <file|url>",
		Short: "Import a SQL database file into an environment",
		Long: "Import a local or remote SQL database file into a VIP Platform environment. " +
			"Local files are validated and uploaded; remote files are fetched by the platform. " +
			"The command polls the import status until completion.",
		Args: cobra.ExactArgs(1),
	}

	// Flags — Node .option() registrations, vip-import-sql.js:546-575.
	cmd.Flags().BoolP("skip-validate", "s", false, "Do not perform file validation prior to import. If the file contains unsupported entries, the import is likely to fail.")
	cmd.Flags().StringArray("search-replace", nil, "Search for a string in a local or remote SQL database file and replace it with a new string. Separate the values by a comma only; no spaces (e.g. --search-replace=\"from,to\"). Can be passed more than once.")
	cmd.Flags().BoolP("in-place", "i", false, "Overwrite a local SQL database file with the results of a search and replace operation prior to import.")
	cmd.Flags().StringP("output", "o", "", "Save the results of a --search-replace operation that is run against a local SQL database file to a copy of that file. Accepts a local file path. Ignored when used with the --in-place option.")
	cmd.Flags().Bool("skip-maintenance-mode", false, "Prevent an unlaunched environment from going into maintenance mode during the import of a local or remote SQL database file. Skipping maintenance mode can cause site instability during import.")
	cmd.Flags().StringP("md5", "m", "", "Verify the integrity of a remote SQL database file. Accepts an MD5 hash value.")
	cmd.Flags().StringArray("header", nil, "Pass a header name and value (Formatted as \"Name: Value\") in a request for a remote SQL database file. Can be passed more than once for multiple headers and values.")
	cmd.Flags().BoolP("skip-backup", "B", false, "Skip creating a backup before importing the SQL file. WARNING: This is extremely dangerous and can result in permanent data loss.")

	addAppEnvFlags(cmd)
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRun(runImportSQL)
}

// Prompt indirection so command-level tests can stub the interactive
// pieces without a TTY.
var (
	importInputPrompt   = appctx.Input
	importConfirmPrompt = appctx.Confirm
)

// importHeader mirrors the parsed {name, value} pairs Node builds in
// parseHeaders (vip-import-sql.js:119).
type importHeader struct {
	Name  string
	Value string
}

// parseImportHeaders ports parseHeaders (vip-import-sql.js:119).
func parseImportHeaders(headers []string) ([]importHeader, error) {
	parsed := make([]importHeader, 0, len(headers))
	for _, header := range headers {
		colonIndex := strings.Index(header, ":")
		if colonIndex == -1 {
			return nil, fmt.Errorf("Invalid header format: %q. Expected format: \"Name: Value\"", header)
		}
		name := strings.TrimSpace(header[:colonIndex])
		value := strings.TrimSpace(header[colonIndex+1:])
		if name == "" {
			return nil, fmt.Errorf("Invalid header format: %q. Header name cannot be empty.", header)
		}
		parsed = append(parsed, importHeader{Name: name, Value: value})
	}
	return parsed, nil
}

// driveLetterProtocolRE — Node isValidUrl rejects single-drive-letter
// "protocols" so Windows paths like C:\x don't count as URLs
// (vip-import-sql.js:99).
var driveLetterProtocolRE = regexp.MustCompile(`(?i)^[a-z]:$`)

// isValidImportURL ports isValidUrl (vip-import-sql.js:96).
func isValidImportURL(s string) bool {
	u, err := url.Parse(s)
	if err != nil || u.Scheme == "" {
		return false
	}
	return !driveLetterProtocolRE.MatchString(u.Scheme + ":")
}

// isValidMd5 ports isValidMd5 (vip-import-sql.js:110).
var md5RE = regexp.MustCompile(`(?i)^[a-f0-9]{32}$`)

func isValidMd5(md5 string) bool { return md5RE.MatchString(md5) }

// importEnvInfo flattens the ImportSQLEnvInfo response fields the
// handler consumes (Node got these via appQuery — vip-import-sql.js:41).
type importEnvInfo struct {
	Launched              bool
	PrimaryDomainName     string
	HasImportStatus       bool
	ImportInProgress      bool
	DbOperationInProgress bool
	WPSites               []importWPSite
	// WPSitesKnown is false when the API returned no site catalog at all
	// (wpSitesSDS null, or wpSitesSDS.nodes null) — Node's `siteArray`
	// being undefined. It is true for a present list, INCLUDING an empty
	// one. The playbook treats the two cases differently.
	WPSitesKnown bool
}

type importWPSite struct {
	ID      int64
	HomeURL string
}

func fetchImportEnvInfo(ctx context.Context, client graphql.Client, appID, envID int64) (*importEnvInfo, error) {
	resp, err := gql.ImportSQLEnvInfo(ctx, client, appID, envID)
	if err != nil {
		return nil, err
	}
	info := &importEnvInfo{}
	if resp == nil || resp.App == nil || len(resp.App.Environments) == 0 || resp.App.Environments[0] == nil {
		return info, nil
	}
	env := resp.App.Environments[0]
	if env.Launched != nil {
		info.Launched = *env.Launched
	}
	if env.PrimaryDomain != nil {
		info.PrimaryDomainName = env.PrimaryDomain.Name
	}
	if env.ImportStatus != nil {
		info.HasImportStatus = true
		if env.ImportStatus.ImportInProgress != nil {
			info.ImportInProgress = *env.ImportStatus.ImportInProgress
		}
		if env.ImportStatus.DbOperationInProgress != nil {
			info.DbOperationInProgress = *env.ImportStatus.DbOperationInProgress
		}
	}
	// Node reads `selectedEnvironmentObj?.wpSitesSDS?.nodes`, so BOTH a null
	// wpSitesSDS and a null nodes leave siteArray undefined. An empty array
	// is a real (fatal) answer; undefined is "don't know" (warn + proceed).
	if env.WpSitesSDS != nil && env.WpSitesSDS.Nodes != nil {
		info.WPSitesKnown = true
		for _, n := range env.WpSitesSDS.Nodes {
			if n == nil {
				continue
			}
			s := importWPSite{}
			if n.Id != nil {
				s.ID = *n.Id
			}
			if n.HomeUrl != nil {
				s.HomeURL = *n.HomeUrl
			}
			info.WPSites = append(info.WPSites, s)
		}
	}
	return info, nil
}

// isMultiSiteInSiteMeta ports is-multi-site.ts:11 (sans Node's WeakMap
// memo — one call per process here).
func isMultiSiteInSiteMeta(ctx context.Context, client graphql.Client, appID, envID int64) (bool, error) {
	resp, err := gql.AppMultiSiteCheck(ctx, client, &appID, &envID)
	if err != nil {
		// Node: exit.withError(`StartImport call failed: ${GraphQlError}`)
		// — is-multi-site.ts:56 (message is a Node copy/paste bug; kept).
		return false, fmt.Errorf("StartImport call failed: %s", err)
	}
	if resp == nil || resp.App == nil || len(resp.App.Environments) == 0 || resp.App.Environments[0] == nil {
		return false, nil
	}
	env := resp.App.Environments[0]
	if (env.IsMultisite != nil && *env.IsMultisite) ||
		(env.IsSubdirectoryMultisite != nil && *env.IsSubdirectoryMultisite) {
		return true, nil
	}
	return false, nil
}

// isMultisitePrimaryDomainMapped ports is-multisite-domain-mapped.ts:72.
func isMultisitePrimaryDomainMapped(ctx context.Context, client graphql.Client, appID, envID int64, primaryDomain string) (bool, error) {
	resp, err := gql.AppMappedDomains(ctx, client, &appID, &envID)
	if err != nil {
		// Node: same copy/paste "StartImport call failed" message
		// (is-multisite-domain-mapped.ts:111).
		return false, fmt.Errorf("StartImport call failed: %s", err)
	}
	if resp == nil || resp.App == nil || len(resp.App.Environments) == 0 || resp.App.Environments[0] == nil {
		return false, nil
	}
	env := resp.App.Environments[0]
	if env.Domains == nil {
		return false, nil
	}
	for _, d := range env.Domains.Nodes {
		if d != nil && d.Name == primaryDomain {
			return true, nil
		}
	}
	return false, nil
}

// gateInput carries everything importSQLGates needs; limits are
// injectable so tests don't need 10GB fixtures.
type gateInput struct {
	FileNameOrURL     string
	IsURL             bool
	Md5               string
	Launched          bool
	AppTypeID         int64
	Info              *importEnvInfo
	Out               io.Writer
	SizeLimit         int64
	SizeLimitLaunched int64
}

// importSQLGates ports gates (vip-import-sql.js:154). Every error string
// is verbatim Node.
func importSQLGates(g gateInput) error {
	if g.SizeLimit == 0 {
		g.SizeLimit = siteimport.SQLImportFileSizeLimit
	}
	if g.SizeLimitLaunched == 0 {
		g.SizeLimitLaunched = siteimport.SQLImportFileSizeLimitLaunched
	}

	if g.Md5 != "" && !isValidMd5(g.Md5) {
		trackEvent("import_sql_command_error", map[string]any{"error_type": "invalid-md5"})
		return errors.New("The provided MD5 hash is invalid. It should be a 32-character hexadecimal string.")
	}
	if !g.IsURL && g.Md5 != "" {
		fmt.Fprintln(g.Out, color.YellowString("The --md5 parameter is only valid for imports from a remote URL. This option will be ignored."))
	}

	if !g.IsURL {
		fileName := g.FileNameOrURL
		meta, metaErr := upload.GetFileMeta(fileName)
		if metaErr != nil {
			// Node's gates call getFileMeta first (js:175), so a missing
			// file errors before any filename validation. Node surfaces a
			// raw ENOENT; we use the gate's own unreadable wording since
			// the raw errno text is platform-specific anyway.
			trackEvent("import_sql_command_error", map[string]any{"error_type": "sqlfile-unreadable"})
			return fmt.Errorf("File '%s' does not exist or is not readable.", fileName)
		}

		if err := sqlvalidation.ValidateFilename(meta.BaseName); err != nil {
			trackEvent("import_sql_command_error", map[string]any{"error_type": "invalid-filename"})
			return err
		}
		if err := sqlvalidation.ValidateImportFileExtension(fileName); err != nil {
			trackEvent("import_sql_command_error", map[string]any{"error_type": "invalid-extension"})
			return err
		}

		fi, statErr := os.Stat(fileName)
		if statErr != nil {
			trackEvent("import_sql_command_error", map[string]any{"error_type": "sqlfile-unreadable"})
			return fmt.Errorf("File '%s' does not exist or is not readable.", fileName)
		}
		if fi.IsDir() {
			trackEvent("import_sql_command_error", map[string]any{"error_type": "sqlfile-notfile"})
			return fmt.Errorf("Path '%s' is not a file.", fileName)
		}
		if f, err := os.Open(fileName); err != nil { // #nosec G304 -- access check, Node checkFileAccess
			trackEvent("import_sql_command_error", map[string]any{"error_type": "sqlfile-unreadable"})
			return fmt.Errorf("File '%s' does not exist or is not readable.", fileName)
		} else {
			f.Close()
		}
		if fi.Size() == 0 {
			trackEvent("import_sql_command_error", map[string]any{"error_type": "sqlfile-empty"})
			return fmt.Errorf("File '%s' is empty.", fileName)
		}

		maxFileSize := g.SizeLimit
		if g.Launched {
			maxFileSize = g.SizeLimitLaunched
		}
		if fi.Size() > maxFileSize {
			trackEvent("import_sql_command_error", map[string]any{
				"error_type": "sqlfile-toobig", "file_size": fi.Size(), "launched": g.Launched,
			})
			launchedNote := ""
			if g.Launched {
				launchedNote = " Note: This limit is lower for launched environments to maintain site stability."
			}
			return fmt.Errorf("The sql import file size (%d bytes) exceeds the limit (%d bytes).%s\n\nPlease split it into multiple files or contact support for assistance.",
				fi.Size(), maxFileSize, launchedNote)
		}
	}

	// currentUserCanImportForApp is a stub in Node (db-file-import.ts:21,
	// always true) — no Go branch needed.

	if !siteimport.IsSupportedApp(g.AppTypeID) {
		trackEvent("import_sql_command_error", map[string]any{"error_type": "unsupported-app"})
		return errors.New("The type of application you specified does not currently support SQL imports.")
	}

	if g.Info == nil || !g.Info.HasImportStatus {
		trackEvent("import_sql_command_error", map[string]any{"error_type": "empty-import-status"})
		return errors.New("Could not determine the import status for this environment. Check the app/environment and if the problem persists, contact support for assistance.")
	}
	if g.Info.ImportInProgress {
		trackEvent("import_sql_command_error", map[string]any{"error_type": "existing-import"})
		return errors.New("There is already an import in progress.\n\nYou can view the status with command:\n    vip import sql status")
	}
	if g.Info.DbOperationInProgress {
		trackEvent("import_sql_command_error", map[string]any{"error_type": "existing-dbop"})
		return errors.New("There is already a database operation in progress. Please try again later.")
	}
	return nil
}

// validateAndGetTableNames ports validateAndGetTableNames
// (vip-import-sql.js:420): run the static SQL checks + the site-type
// (multisite) checks, returning the captured table names. The "Reading
// line N " ticker (sql.ts:533) prints every 500 lines.
func validateAndGetTableNames(cmd *cobra.Command, client graphql.Client, appID, envID int64, fileName string, skipValidate bool, searchReplace []string, isMultiSite bool) ([]string, error) {
	out := cmd.OutOrStdout()
	if skipValidate {
		fmt.Fprintln(out, "Skipping SQL file validation.")
		return []string{}, nil
	}

	f, err := os.Open(fileName) // #nosec G304 -- user-supplied CLI path
	if err != nil {
		// line-by-line.ts:29 wording.
		return nil, errors.New("The file at the provided path is either missing or not readable. Please check the input and try again.")
	}
	defer f.Close()

	// Static checks + multisite capture share one streaming pass, like
	// Node's fileLineValidations dispatch loop (line-by-line.ts:51).
	wpSiteCapture := siteimport.NewMultilineCapture("INSERT INTO `wp_site`")
	var wpSiteStatements [][]string
	ticker := newImportLineTicker(out, isTerminalWriter(out))
	res, scanErr := sqlvalidation.ValidateWithLineHook(f, func(line string, lineNum int) {
		if lineNum%500 == 0 {
			ticker.tick(lineNum) // sql.ts:533 trailing space
		}
		wpSiteStatements = wpSiteCapture.Feed(line)
	})
	ticker.done()
	if scanErr != nil {
		return nil, fmt.Errorf("Error validating input file: %s", scanErr)
	}
	isMultiSiteSqlDump := res.IsMultiSite

	// Static-validation report (import mode): problems throw with the
	// joined error output + --skip-validate advice (vip-import-sql.js:436).
	if msg, problems := buildImportValidationError(res); problems > 0 {
		fmt.Fprintln(out, "")
		return nil, fmt.Errorf("%s\n\nIf you are confident that the file does not contain unsupported statements, you can retry the command with the %s option.\n",
			msg, color.YellowString("--skip-validate"))
	}

	// siteTypeValidations.postLineExecutionProcessing (site-type.ts:29).
	if !isMultiSite && isMultiSiteSqlDump {
		trackEvent("import_sql_command_error", map[string]any{"error_type": "not-multisite-with-multisite-sql-dump"})
		return nil, errors.New("You have provided a multisite SQL dump file for import into a single site (non-multisite).")
	}
	if isMultiSite && !isMultiSiteSqlDump {
		trackEvent("import_sql_command_error", map[string]any{"error_type": "subsite-import-without-subsite-sql-dump"})
		return nil, errors.New("You have requested a subsite SQL import but have not provided a subsite compatible SQL dump.")
	}

	primaryDomain := siteimport.MaybeSearchReplacePrimaryDomain(
		siteimport.GetPrimaryDomainFromSQL(wpSiteStatements), searchReplace)
	if primaryDomain != "" {
		mapped, err := isMultisitePrimaryDomainMapped(cmd.Context(), client, appID, envID, primaryDomain)
		if err != nil {
			return nil, err
		}
		if isMultiSite && !mapped {
			trackEvent("import_sql_command_error", map[string]any{"error_type": "multisite-import-where-primary-domain-unmapped"})
			return nil, errors.New("This import would set the network's main site domain to " + primaryDomain +
				", however this domain is not mapped to the target environment. Please replace this domain in your " +
				"import file, or map it to the environment.")
		}
	}

	return res.TableNames, nil
}

// isTerminalWriter reports whether w is backed by a terminal. Sensing the
// WRITER (rather than os.Stdout unconditionally) keeps redirected output and
// tests honest.
func isTerminalWriter(w io.Writer) bool {
	f, ok := w.(interface{ Fd() uintptr })
	return ok && term.IsTerminal(int(f.Fd()))
}

// importLineTicker renders the "Reading line N" validation counter.
//
// Node's sql.ts imports `{ stdout as log } from '@wwa/single-line-log'` and
// calls log(`Reading line ${lineNum} `) every 500 lines (sql.ts:531-534), so
// the counter REWRITES itself in place. Printing a newline-terminated line
// per tick instead means a 5M-line dump buries the validation findings under
// ~10,000 lines of progress chrome.
//
// tui.MultiLineRenderer is the repo's in-place renderer (the same primitive
// startImportProgressRenderer uses); a one-element frame is the single-line
// case. On a non-TTY sink the ticker goes silent: Node still emits its
// cursor-movement escapes there, but those carry no information once the
// output is a pipe or a CI log — and emitting raw ANSI (or the old
// 10,000 lines) is strictly worse than nothing. This matches the non-TTY
// handling in startImportProgressRenderer (progress_renderer.go:36).
type importLineTicker struct {
	r *tui.MultiLineRenderer
}

func newImportLineTicker(w io.Writer, tty bool) *importLineTicker {
	if !tty {
		return &importLineTicker{}
	}
	return &importLineTicker{r: tui.NewMultiLineRenderer(w, true)}
}

func (t *importLineTicker) tick(lineNum int) {
	if t.r == nil {
		return
	}
	// Trailing space is Node's (sql.ts:533).
	t.r.Render([]string{fmt.Sprintf("Reading line %d ", lineNum)})
}

// done releases the line so subsequent output starts fresh instead of
// overwriting the last counter frame.
func (t *importLineTicker) done() {
	if t.r == nil {
		return
	}
	t.r.Done()
}

// importSearchReplacePair is one parsed --search-replace value.
// HasTo distinguishes "no replacement given at all" from "replace with the
// empty string" — two different wire payloads with two different server
// behaviors.
type importSearchReplacePair struct {
	From  string
	To    string
	HasTo bool
}

// parseImportSearchReplacePair ports Node's
// `pair.split( ',' ).map( str => str.trim() )` + `{from: arr[0], to: arr[1]}`
// (vip-import-sql.js:821-827; the identical destructure lives in
// formatSearchReplaceValues, format.ts:201).
//
// Two JS behaviors that a naive strings.SplitN(pair, ",", 2) gets wrong:
//
//   - split(',') has no limit, so "a,b,c" → ["a","b","c"] and only the first
//     two entries are read. The tail is DISCARDED, not appended to `to`.
//   - with no comma, arr[1] is undefined, and JSON.stringify omits undefined
//     properties — so `to` never reaches the server.
func parseImportSearchReplacePair(pair string) importSearchReplacePair {
	parts := strings.Split(pair, ",")
	out := importSearchReplacePair{From: strings.TrimSpace(parts[0])}
	if len(parts) > 1 {
		out.To = strings.TrimSpace(parts[1])
		out.HasTo = true
	}
	return out
}

// localSearchReplaceNeeded reports whether the local search-replace pass will
// produce anything anyone can observe.
//
// DELIBERATE DIVERGENCE FROM NODE — cost only, no change to imported bytes.
// Node runs the pass for every local file with pairs and then discards the
// result: `outputFileName` is destructured at vip-import-sql.js:674,
// type-checked at :681, and never referenced again, because `fileNameToUpload`
// was pinned to the ORIGINAL at :577. Validation does not use it either (it
// takes the original plus the raw pairs and simulates the replacement). The
// server performs the real replacement from the StartImport payload.
//
// So on the default path Node reads the whole dump and writes a rewritten copy
// to a temp file that nothing ever opens — on a 5 GB dump, 5 GB read and 5 GB
// written for nothing. We run it only when the output is observable:
//   - --in-place, which rewrites the user's own file and is the only thing that
//     changes what gets uploaded, or
//   - an explicit --output, which the user asked for as an artifact.
//
// Note --output is NOT the file that gets imported, in either CLI; only
// --in-place changes that. See TestImportSQLHappyPathUploadsOriginalFile.
func localSearchReplaceNeeded(isURL, inPlace bool, output string, searchReplace []string) bool {
	if isURL || len(searchReplace) == 0 {
		return false // Node never runs a local pass for a URL
	}
	return inPlace || output != ""
}

// serverSideSearchReplaceNeeded reports whether --search-replace pairs must be
// sent to the server, i.e. whether the bytes we uploaded still need replacing.
//
// DELIBERATE DIVERGENCE FROM NODE. Node applies the pairs twice on the
// --in-place path, which silently corrupts non-idempotent replacements:
//
//   - vip-import-sql.js:577 sets `fileNameToUpload = fileNameOrURL` BEFORE the
//     search-replace block at :671 and never reassigns it, so the rewritten
//     --output copy is discarded and the ORIGINAL is uploaded. The server pass
//     at :760 is then the only application. Correct.
//   - With --in-place the original file on disk IS the rewritten file, so the
//     upload already carries the replacements — and :760 is not gated on
//     isUrl, so the server applies them again.
//
// A domain swap is idempotent and hides this (the second pass matches
// nothing), but a pair like `a,aa` turns "a" into "aaaa". We send the pairs
// only when the upload has not already been rewritten.
func serverSideSearchReplaceNeeded(isURL, inPlace bool, searchReplace []string) bool {
	if len(searchReplace) == 0 {
		return false
	}
	// A URL is never rewritten locally (runImportSQL forces inPlace=false for
	// URLs), so the server must always do the work.
	if isURL {
		return true
	}
	// Local file: only --in-place mutates what we upload.
	return !inPlace
}

// buildImportSearchReplaceInput maps the raw --search-replace values onto
// the StartImport input shape. A pair with no comma leaves To nil so the
// field is omitted from the JSON body, matching Node. Sending to:"" instead
// would tell the server to replace every occurrence of `from` with nothing.
func buildImportSearchReplaceInput(searchReplace []string) []*gql.AppEnvironmentImportSearchReplace {
	pairs := make([]*gql.AppEnvironmentImportSearchReplace, 0, len(searchReplace))
	for _, raw := range searchReplace {
		p := parseImportSearchReplacePair(raw)
		from := p.From
		entry := &gql.AppEnvironmentImportSearchReplace{From: &from}
		if p.HasTo {
			to := p.To
			entry.To = &to
		}
		pairs = append(pairs, entry)
	}
	return pairs
}

// displayPlaybook ports displayPlaybook (vip-import-sql.js:446).
func displayPlaybook(out io.Writer, fileName, domain, formattedEnv string, app appctx.App, launched, isMultiSite bool, tableNames, searchReplace []string, wpSites []importWPSite, wpSitesKnown bool) error {
	fmt.Fprintln(out)
	fmt.Fprintf(out, "  importing: %s\n", color.HiBlueString(fileName))
	fmt.Fprintf(out, "         to: %s\n", color.CyanString(domain))
	fmt.Fprintf(out, "       site: %s (%s)\n", app.Name, formattedEnv)

	// Node's formatSearchReplaceValues (format.ts:201) destructures the same
	// `split(',').map(trim)` as the wire payload, so the playbook must show
	// the same from/to the server will receive.
	for _, pair := range searchReplace {
		p := parseImportSearchReplacePair(pair)
		fmt.Fprintf(out, "        s-r: %s -> %s\n", color.BlueString(p.From), color.BlueString(p.To))
	}

	if isMultiSite {
		fmt.Fprintf(out, "  multisite: true\n")
	}

	if len(tableNames) == 0 {
		return nil // validation skipped — no playbook table info (js:481)
	}
	fmt.Fprintln(out)
	if !isMultiSite {
		fmt.Fprintln(out, "Tables that will be imported by this process:")
		fmt.Fprintln(out, strings.Join(tableNames, "  "))
		return nil
	}

	// Node's three-way branch (js:489-499). `siteArray` is
	// `selectedEnvironmentObj?.wpSitesSDS?.nodes`:
	//
	//   undefined (wpSitesSDS or nodes null) → yellow warning, then RETURN
	//                                          (the import proceeds)
	//   []                                   → throw
	//   [...]                                → per-site table breakdown
	//
	// Proceeding on "unknown" is not unguarded: promptToContinueImport still
	// makes the user type the target domain immediately after the playbook.
	// Hard-failing here would make SQL import impossible on any multisite
	// whose site catalog the API declines to return.
	if !wpSitesKnown {
		fmt.Fprintln(out, color.YellowString(
			"Unable to determine the network sites affected by this import. Please proceed only if you are confident that the contents of the file are valid for import."))
		return nil
	}
	if len(wpSites) == 0 {
		return errors.New("There were no sites in your multisite installation.")
	}

	if launched {
		fmt.Fprintln(out, color.YellowString("You are updating tables in a launched multisite environment. The performance of sites on the network might be impacted by this operation."))
	}
	fmt.Fprintln(out, color.YellowString("The following sites will be affected by the import:"))
	for _, site := range wpSites {
		var siteRE *regexp.Regexp
		if site.ID == 1 {
			siteRE = regexp.MustCompile(`(?i)^wp_[a-z]+`)
		} else {
			siteRE = regexp.MustCompile(fmt.Sprintf(`(?i)^wp_%d_[a-z]+`, site.ID))
		}
		var group []string
		for _, name := range tableNames {
			if siteRE.MatchString(name) {
				group = append(group, name)
			}
		}
		fmt.Fprintln(out)
		fmt.Fprintln(out, color.HiBlueString(
			fmt.Sprintf("Blog with ID %d and URL %s will import the following tables:", site.ID, site.HomeURL)))
		fmt.Fprintln(out, strings.Join(group, "  "))
	}
	return nil
}

// promptToContinueImport ports promptToContinue (vip-import-sql.js:326):
// the user must type the (uppercased) domain to proceed.
func promptToContinueImport(cmd *cobra.Command, out io.Writer, launched bool, formattedEnv, domain string, isMultiSite bool, tableNames []string) error {
	fmt.Fprintln(out)
	promptToMatch := strings.ToUpper(domain)
	source := "the above file"
	if !isMultiSite && len(tableNames) > 0 {
		source = "the above tables"
	}
	launchedLabel := "unlaunched"
	if launched {
		launchedLabel = "launched"
	}
	message := fmt.Sprintf("You are about to import %s into the %s %s environment %s.\nType '%s' (without the quotes) to continue:\n",
		source, launchedLabel, formattedEnv, color.YellowString(domain), color.YellowString(promptToMatch))
	answer, err := importInputPrompt(cmd, message, "")
	if err != nil || strings.ToUpper(answer) != promptToMatch {
		trackEvent("import_sql_unexpected_tables", nil)
		return errors.New("The input did not match the expected environment label. Import aborted.")
	}
	return nil
}

// confirmSkipBackup ports confirmSkipBackup (vip-import-sql.js:359): the
// ⚠️ warning wall, a y/n confirm, then a typed "yes".
func confirmSkipBackup(cmd *cobra.Command, out io.Writer) (bool, error) {
	fmt.Fprintln(out, color.New(color.FgRed, color.Bold).Sprint("⚠️ WARNING ⚠️"))
	fmt.Fprintln(out, color.RedString(color.New(color.FgRed, color.Bold).Sprint("YOU ARE ABOUT TO SKIP CREATING A BACKUP BEFORE IMPORTING SQL!\n")))
	fmt.Fprintln(out, color.New(color.FgYellow, color.Bold).Sprint("This action is EXTREMELY DANGEROUS and can result in:"))
	fmt.Fprintln(out, color.New(color.FgYellow, color.Bold).Sprint("• Permanent data loss"))
	fmt.Fprintln(out, color.New(color.FgYellow, color.Bold).Sprint("• Inability to automatically restore your database"))
	fmt.Fprintln(out, color.New(color.FgYellow, color.Bold).Sprint("• Complete site failure"))
	fmt.Fprintln(out, color.New(color.FgRed, color.Bold).Sprint("There is NO way to undo this action once the import begins!\n"))

	importAbortedMsg := color.RedString("✗ Import aborted.")

	first, err := importConfirmPrompt(cmd, "Are you absolutely certain you want to skip the backup?", false)
	if err != nil || !first {
		trackEvent("import_sql_skip_backup_cancelled", nil)
		fmt.Fprintln(out, importAbortedMsg)
		return false, nil
	}

	second, err := importInputPrompt(cmd,
		fmt.Sprintf("Type '%s' (without quotes) to proceed WITHOUT creating a backup (this cannot be undone):\n", color.YellowString("yes")), "")
	if err != nil || strings.ToLower(second) != "yes" {
		trackEvent("import_sql_skip_backup_cancelled", nil)
		fmt.Fprintln(cmd.ErrOrStderr(), "Failed to confirm!")
		fmt.Fprintln(out, importAbortedMsg)
		return false, nil
	}

	trackEvent("import_sql_skip_backup_confirmed", nil)
	fmt.Fprintln(out, color.RedString("⚠️ Backup will be skipped. Proceeding with import..."))
	return true, nil
}

func runImportSQL(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	out := cmd.OutOrStdout()
	fileNameOrURL := args[0]

	skipValidate, _ := cmd.Flags().GetBool("skip-validate")
	searchReplace, _ := cmd.Flags().GetStringArray("search-replace")
	inPlace, _ := cmd.Flags().GetBool("in-place")
	output, _ := cmd.Flags().GetString("output")
	skipMaintenanceMode, _ := cmd.Flags().GetBool("skip-maintenance-mode")
	md5Flag, _ := cmd.Flags().GetString("md5")
	headerFlags, _ := cmd.Flags().GetStringArray("header")
	skipBackup, _ := cmd.Flags().GetBool("skip-backup")

	gqlCtx := gql.WithAllowGQLErrors(cmd.Context())
	info, err := fetchImportEnvInfo(gqlCtx, cfg.GQLClient, ae.App.ID, ae.Env.ID)
	if err != nil {
		return err
	}
	isMultiSite, err := isMultiSiteInSiteMeta(gqlCtx, cfg.GQLClient, ae.App.ID, ae.Env.ID)
	if err != nil {
		return err
	}
	isURL := isValidImportURL(fileNameOrURL)

	headers, err := parseImportHeaders(headerFlags)
	if err != nil {
		return err
	}
	if !isURL && len(headers) > 0 {
		fmt.Fprintln(out, color.YellowString("The --header option is only valid for imports from a remote URL. This option will be ignored."))
	}
	if isURL && inPlace {
		// Node's wording says "remote URL" here — known Node copy bug,
		// kept bug-for-bug (vip-import-sql.js:600).
		fmt.Fprintln(out, color.YellowString("The --in-place option is only valid for imports from a remote URL. This option will be ignored."))
		inPlace = false
	}
	if isURL && output != "" {
		fmt.Fprintln(out, color.YellowString("The --output option is only valid for imports of a local file. This option will be ignored."))
		output = ""
	}

	trackEvent("import_sql_command_execute", map[string]any{"is_url": isURL})

	if err := importSQLGates(gateInput{
		FileNameOrURL: fileNameOrURL, IsURL: isURL, Md5: md5Flag,
		Launched: info.Launched, AppTypeID: ae.App.TypeId, Info: info, Out: out,
	}); err != nil {
		return err
	}

	domain := info.PrimaryDomainName
	if domain == "" {
		domain = fmt.Sprintf("#%d", ae.Env.ID) // js:626
	}
	formattedEnv := formatEnvironment(ae.Env.Type)
	launched := info.Launched

	// fileNameToUpload === fileNameOrURL in Node (js:630, never
	// reassigned): the --output copy of a search-replace run is NOT what
	// gets uploaded; only --in-place mutates the original. Bug-for-bug.
	fileNameToUpload := fileNameOrURL

	var tableNames []string
	if !isURL {
		tableNames, err = validateAndGetTableNames(cmd, cfg.GQLClient, ae.App.ID, ae.Env.ID,
			fileNameToUpload, skipValidate, searchReplace, isMultiSite)
		if err != nil {
			return err
		}
	}

	if err := displayPlaybook(out, fileNameOrURL, domain, formattedEnv, ae.App,
		launched, isMultiSite, tableNames, searchReplace, info.WPSites, info.WPSitesKnown); err != nil {
		return err
	}

	if err := promptToContinueImport(cmd, out, launched, formattedEnv, domain, isMultiSite, tableNames); err != nil {
		return err
	}

	if skipBackup {
		confirmed, err := confirmSkipBackup(cmd, out)
		if err != nil {
			return err
		}
		if !confirmed {
			return nil // Node: process.exit(0)
		}
	}

	if !isURL && inPlace {
		approved, err := importConfirmPrompt(cmd,
			"Are you sure you want to run search and replace on your input file? This operation is not reversible.", false)
		if err != nil || !approved {
			trackEvent("search_replace_in_place_cancelled", map[string]any{"is_import": true, "in_place": inPlace})
			return nil // Node: process.exit()
		}
	}

	// ===== progress phase: no stray prints below (js:690 WARNING) =====
	pt := tui.NewProgressTracker([]tui.ProgressStep{
		{ID: "replace", Name: "Performing search and replace"},
		{ID: "upload", Name: "Uploading file"},
		{ID: "queue_import", Name: "Queueing import"},
	})
	status := "running"
	setPrefixSuffix := func() {
		pt.SetPrefix("\n=============================================================\nProcessing the SQL import for your environment...\n")
		trailing := ""
		if status == "running" {
			trailing = "Loading remaining steps"
		}
		pt.SetSuffix("\n" + tui.GlyphForStatus(tui.StepState(status), tui.SpinnerGlyphs[0]) + " " + trailing)
	}
	setPrefixSuffix()
	renderer := startImportProgressRenderer(cmd, pt)
	defer renderer.stop(cmd, false)

	failWithError := func(failureErr error) error {
		status = "failed"
		setPrefixSuffix()
		renderer.stop(cmd, true)
		return failureErr
	}

	switch {
	case localSearchReplaceNeeded(isURL, inPlace, output, searchReplace):
		_ = pt.StepRunning("replace")
		res, srErr := searchreplace.Run(fileNameOrURL, searchReplace, searchreplace.Options{
			InPlace: inPlace, Output: output,
		})
		if srErr != nil {
			_ = pt.StepFailed("replace")
			return failWithError(srErr)
		}
		if res.OutputFileName == "" {
			_ = pt.StepFailed("replace")
			return failWithError(errors.New("Unable to determine location of the intermediate search and replace file."))
		}
		_ = pt.StepSuccess("replace")
	case !isURL && len(searchReplace) > 0:
		// Pairs were given, but the local pass would only write a temp file
		// nothing ever opens (see localSearchReplaceNeeded). The server applies
		// them from the StartImport payload instead. The step still reports
		// success because the replacement IS happening — just not here — so the
		// progress output matches Node's.
		_ = pt.StepRunning("replace")
		_ = pt.StepSuccess("replace")
	default:
		_ = pt.StepSkipped("replace")
	}

	appID := ae.App.ID
	envID := ae.Env.ID
	input := &gql.AppEnvironmentImportInput{
		Id:                  &appID,
		EnvironmentId:       &envID,
		SkipMaintenanceMode: &skipMaintenanceMode,
	}
	if skipBackup {
		t := true
		input.SkipBackup = &t
	}

	if isURL {
		_ = pt.StepSkipped("upload")
		input.Url = &fileNameOrURL
		input.SearchReplace = []*gql.AppEnvironmentImportSearchReplace{}
		if md5Flag != "" {
			input.Md5 = &md5Flag
		}
		urlHeaders := make([]*gql.RequestHeader, 0, len(headers))
		for _, h := range headers {
			urlHeaders = append(urlHeaders, &gql.RequestHeader{Name: h.Name, Value: h.Value})
		}
		input.UrlHeaders = urlHeaders
	} else {
		_ = pt.StepRunning("upload")
		meta, metaErr := upload.GetFileMeta(fileNameToUpload)
		if metaErr != nil {
			_ = pt.StepFailed("upload")
			return failWithError(metaErr)
		}
		uc := &upload.Client{APIHost: cfg.APIHost, Token: cfg.Token}
		res, upErr := uc.UploadImportFile(cmd.Context(), appID, envID, meta, "md5",
			func(pct string) { pt.SetUploadPercentage(pct) })
		if upErr != nil {
			trackEvent("import_sql_command_error", map[string]any{
				"error_type": "upload_failed", "upload_error": upErr.Error(),
			})
			_ = pt.StepFailed("upload")
			return failWithError(upErr)
		}
		basename := res.Meta.BaseName
		checksum := res.Checksum
		input.Basename = &basename
		input.Md5 = &checksum
		input.SearchReplace = []*gql.AppEnvironmentImportSearchReplace{}
		_ = pt.StepSuccess("upload")
		trackEvent("import_sql_upload_complete", nil)
	}

	// searchReplace pairs → input.SearchReplace [{from,to}] (js:760-774),
	// but only when the uploaded bytes have not already been rewritten.
	// DELIBERATE DIVERGENCE — see serverSideSearchReplaceNeeded.
	if serverSideSearchReplaceNeeded(isURL, inPlace, searchReplace) {
		input.SearchReplace = buildImportSearchReplaceInput(searchReplace)
	}

	if _, err := gql.StartImport(gql.WithAllowGQLErrors(cmd.Context()), cfg.GQLClient, input); err != nil {
		trackEvent("import_sql_command_error", map[string]any{"error_type": "StartImport-failed"})
		_ = pt.StepFailed("queue_import")
		return failWithError(fmt.Errorf("StartImport call failed: %s", err))
	}
	_ = pt.StepSuccess("queue_import")

	return importSQLCheckStatus(cmd, pt, renderer, ae, domain, false)
}

// importPollInterval — VIP_IMPORT_SQL_INTERVAL_MS overrides the 5s Node
// default for tests (the VIP_SYNC_INTERVAL_MS precedent, sync.go:180).
func importPollInterval() time.Duration {
	if v := os.Getenv("VIP_IMPORT_SQL_INTERVAL_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return siteimport.DefaultPollInterval
}

// importSQLCheckStatus wraps siteimport.CheckStatus: builds the
// ProgressFetch closure over gql.ImportSQLProgress (including the
// pseudo-job synthesis from importStatus.progress — status.ts:288-328),
// renders the Status/Site suffix block, and maps the terminal outcome to
// Node's output + exit semantics.
func importSQLCheckStatus(cmd *cobra.Command, pt *tui.ProgressTracker, renderer *importProgressRenderer, ae *appctx.AppEnv, domain string, returnFast bool) error {
	cfg := GetConfig()
	pollCtx := gql.WithAllowGQLErrors(cmd.Context())

	fetch := func(ctx context.Context) (*siteimport.ProgressSnapshot, error) {
		appID := ae.App.ID
		envID := ae.Env.ID
		resp, err := gql.ImportSQLProgress(ctx, cfg.GQLClient, &appID, &envID)
		if err != nil {
			return nil, err
		}
		if resp == nil || resp.App == nil || len(resp.App.Environments) == 0 || resp.App.Environments[0] == nil {
			// status.ts:92 — "Unable to determine import status from environment"
			return nil, errors.New("Unable to determine import status from environment")
		}
		env := resp.App.Environments[0]
		snap := &siteimport.ProgressSnapshot{}
		if env.Launched != nil {
			snap.Launched = *env.Launched
		}

		var importStatus = env.ImportStatus
		var statusSteps []siteimport.JobStep
		var statusStartedAt int64
		var failedStep *siteimport.FailedStep
		if importStatus != nil && importStatus.Progress != nil {
			if importStatus.Progress.Started_at != nil {
				statusStartedAt = int64(*importStatus.Progress.Started_at)
			}
			for _, s := range importStatus.Progress.Steps {
				if s == nil {
					continue
				}
				name := ""
				if s.Name != nil {
					name = *s.Name
				}
				result := ""
				if s.Result != nil {
					result = *s.Result
				}
				statusSteps = append(statusSteps, siteimport.JobStep{
					ID:     name,
					Name:   siteimport.Capitalize(strings.ReplaceAll(name, "_", " ")),
					Status: tui.StepState(result),
				})
				if result == "failed" && failedStep == nil {
					fs := &siteimport.FailedStep{Name: name, Output: nil}
					if s.Started_at != nil {
						fs.StartedAt = int64(*s.Started_at)
					}
					for _, o := range s.Output {
						if o != nil {
							fs.Output = append(fs.Output, *o)
						}
					}
					failedStep = fs
				}
			}
		}
		snap.StatusProgressStartedAt = statusStartedAt
		snap.FailedStep = failedStep

		if len(env.Jobs) > 0 && env.Jobs[0] != nil {
			job := *env.Jobs[0]
			ij := &siteimport.ImportJob{}
			if c := job.GetCreatedAt(); c != nil {
				ij.CreatedAt = *c
			}
			if c := job.GetCompletedAt(); c != nil {
				ij.CompletedAt = *c
			}
			if p := job.GetProgress(); p != nil {
				if p.Status != nil {
					ij.Status = *p.Status
				}
				for _, s := range p.Steps {
					if s == nil {
						continue
					}
					step := siteimport.JobStep{}
					if s.Id != nil {
						step.ID = *s.Id
					}
					if s.Name != nil {
						step.Name = *s.Name
					}
					if s.Status != nil {
						step.Status = tui.StepState(*s.Status)
					}
					ij.Steps = append(ij.Steps, step)
				}
			}
			snap.Job = ij
			return snap, nil
		}

		// No k8s job: synthesize from importStatus.progress
		// (status.ts:288-328). No steps yet → Job stays nil (wait).
		if len(statusSteps) == 0 {
			return snap, nil
		}
		ij := &siteimport.ImportJob{Steps: statusSteps}
		anyFailed := false
		allSuccess := true
		restoreDBPending := false
		var maxFinished int64
		for _, s := range importStatus.Progress.Steps {
			if s == nil {
				continue
			}
			result := ""
			if s.Result != nil {
				result = *s.Result
			}
			name := ""
			if s.Name != nil {
				name = *s.Name
			}
			if result == "failed" {
				anyFailed = true
			}
			if result != "success" {
				allSuccess = false
			}
			if name == "restore_db" && result == "" {
				restoreDBPending = true
			}
			if s.Finished_at != nil && int64(*s.Finished_at) > maxFinished {
				maxFinished = int64(*s.Finished_at)
			}
		}
		if anyFailed && !restoreDBPending {
			ij.Status = "error"
		} else if allSuccess {
			ij.Status = "success"
			ij.CompletedAt = time.Unix(maxFinished, 0).UTC().Format(time.RFC1123)
		}
		if statusStartedAt > 0 {
			ij.CreatedAt = time.Unix(statusStartedAt, 0).UTC().Format(time.RFC1123)
		}
		snap.Job = ij
		return snap, nil
	}

	overall := "Checking..." // status.ts:213
	setSuffix := func(createdAt, completedAt string) {
		sprite := tui.GlyphForStatus(tui.StepState(overall), tui.SpinnerGlyphs[0])
		formattedCreated := "TBD"
		if createdAt != "" {
			formattedCreated = createdAt
		}
		formattedCompleted := "TBD"
		if createdAt != "" && completedAt != "" {
			formattedCompleted = completedAt
		}
		exitPrompt := "(Press ^C to hide progress. The import will continue in the background.)"

		var statusMessage string
		switch overall {
		case "success":
			statusMessage = fmt.Sprintf("Success %s imported data should be visible on your site %s.", sprite, domain)
		case "running":
			if pt.AllStepsSucceeded() {
				statusMessage = fmt.Sprintf("Finishing up... %s ", sprite)
			} else {
				statusMessage = fmt.Sprintf("%s %s", siteimport.Capitalize(overall), sprite)
			}
		default:
			statusMessage = fmt.Sprintf("%s %s", siteimport.Capitalize(overall), sprite)
		}

		maybeExitPrompt := ""
		if overall == "running" {
			maybeExitPrompt = exitPrompt
		}
		maybeTimestamps := ""
		if overall == "running" || overall == "success" || overall == "failed" {
			maybeTimestamps = fmt.Sprintf("\nSQL Import Started: %s\nSQL Import Completed: %s", formattedCreated, formattedCompleted)
		}
		pt.SetSuffix(fmt.Sprintf("\n=============================================================\nStatus: %s\nSite: %s (%s)%s\n=============================================================\n%s\n",
			statusMessage, ae.App.Name, formatEnvironment(ae.Env.Type), maybeTimestamps, maybeExitPrompt))
	}

	res, err := siteimport.CheckStatus(pollCtx, siteimport.CheckStatusOpts{
		Fetch:                       fetch,
		Tracker:                     pt,
		Interval:                    importPollInterval(),
		ReturnMissingJobImmediately: returnFast,
		OnPoll: func(createdAt, completedAt, _ string) {
			setSuffix(createdAt, completedAt)
		},
	})
	if err != nil {
		var fe *siteimport.ImportFailedError
		if errors.As(err, &fe) {
			overall = "failed"
			renderer.stop(cmd, true)
			return errors.New(siteimport.GetErrorMessage(fe))
		}
		renderer.stop(cmd, true)
		return err
	}

	if res.Message != "" {
		overall = res.Message // e.g. "No import job found" (status.ts:421)
	} else {
		overall = res.Status
	}
	setSuffix(res.CreatedAt, res.CompletedAt)
	renderer.stop(cmd, true)
	return nil
}

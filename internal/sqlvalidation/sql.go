package sqlvalidation

import (
	"io"
	"os"
	"regexp"
	"strings"
)

// FormatterKind classifies how a check's accumulated results are rendered
// in the validate-sql summary. Mirrors the four outputFormatter closures
// in Node's src/lib/validations/sql.ts:
//
//   - FormatterLineNumber: lineNumberCheckFormatter — joins lineNumbers and
//     emits "<message> on line(s) X, Y, Z."; "<message> was found 0 times."
//     when empty.
//   - FormatterRequired: requiredCheckFormatter — inverts: 0 results is the
//     PROBLEM ("<message> was not found."). For createTable, also runs the
//     wp_ / wp_<n>_ prefix sub-classifier.
//   - FormatterInfo: infoCheckFormatter — pushes every result.Text as an
//     info line; never produces an error.
//   - FormatterGeneral: generalCheckFormatter — drops FalsePositive results,
//     then emits one line PER surviving result ("<message> on line N.",
//     singular) with that result's own Recommendation when it has one.
//
// FormatterGeneral is used only by siteHomeUrlLando, which validate-sql
// always skips (DEV_ENV_SPECIFIC_CHECKS). Its only consumer is the dev-env
// import renderer in internal/devenv; the platform renderer in
// cmd/vip-next/commands/sqlreport.go never sees it.
type FormatterKind int

const (
	FormatterLineNumber FormatterKind = iota
	FormatterRequired
	FormatterInfo
	FormatterGeneral
)

// Check keys that Node lists in DEV_ENV_SPECIFIC_CHECKS (sql.ts:394). They
// are skipped by every platform caller and registered only by the dev-env
// import path.
const (
	CheckUseStatement     = "useStatement"
	CheckSiteHomeURLLando = "siteHomeUrlLando"
)

// DevEnvSpecificChecks ports DEV_ENV_SPECIFIC_CHECKS (sql.ts:394). It is the
// skipChecks value of Node's DEFAULT_VALIDATION_OPTIONS (sql.ts:522-526), so
// every platform entry point (`vip import validate-sql`, `vip import sql`)
// omits both checks. Node's dev-env import OVERRIDES skipChecks with `[]`,
// which is what turns them on there.
var DevEnvSpecificChecks = []string{CheckUseStatement, CheckSiteHomeURLLando}

// Options mirrors Node's ValidationOptions (sql.ts:68-75) minus isImport,
// which is a rendering concern the callers own.
type Options struct {
	// SkipChecks lists check keys to leave unregistered.
	SkipChecks []string
	// ExtraCheckParams supplies the third argument Node threads into
	// matchHandler (sql.ts:544), keyed by check name. Only siteHomeUrlLando
	// reads one: the expected local domain.
	ExtraCheckParams map[string]string
}

// PlatformOptions is the port of DEFAULT_VALIDATION_OPTIONS (sql.ts:522):
// skip the two dev-env-specific checks, no extra params. Every platform
// caller must use this (Validate/ValidateFile already do).
func PlatformOptions() Options {
	return Options{SkipChecks: DevEnvSpecificChecks}
}

// CheckResult holds one match captured from a single SQL line. Fields are
// optional — different formatters consume different fields:
//
//   - Line: 1-indexed line number where the match was captured.
//   - Text: the captured text (table name for dropTable/createTable, raw
//     match for siteHomeUrl).
//   - FalsePositive: Node's `falsePositive` — the matchHandler looked at the
//     match and decided it is not a finding after all. Only siteHomeUrlLando
//     sets it. FalsePositive results are dropped before rendering.
//   - Recommendation: Node's `recomendation` (sic) — a per-result override of
//     the check's own Recommendation. siteHomeUrlLando uses it to name the
//     exact --search-replace flag that fixes THIS line.
//
// Node's fourth per-result field, `warning`, is deliberately NOT ported.
// Severity for the dev-env path is owned by the single tier table in
// internal/devenv/importvalidate.go, so there is exactly one place to look.
type CheckResult struct {
	Line           int
	Text           string
	FalsePositive  bool
	Recommendation string
}

// Check mirrors Node's CheckType. Identity is the key it's filed under in
// the checks map (binaryLogging, trigger, etc.); name is the human-readable
// label used in the rendered output.
type Check struct {
	Key            string         // identity (binaryLogging, trigger, ...)
	Matcher        *regexp.Regexp // compiled from Node's `matcher` field
	Message        string         // Node's `message`
	Recommendation string         // Node's `recommendation`
	Formatter      FormatterKind  // outputFormatter family
	// MatchHandler decides what to record from a successful match. Mirrors
	// Node's matchHandler arrow, including its third argument: the
	// per-check extraParam from Options.ExtraCheckParams (sql.ts:544).
	// Only siteHomeUrlLando reads it; every other handler ignores it.
	MatchHandler func(lineNum int, matches []string, extraParam string) CheckResult
	Results      []CheckResult // accumulated during Validate()
}

// Result is the full output of Validate(). Order is deterministic: Checks
// retains insertion order, matching Node's Object.entries(checks) iteration
// order (V8 preserves insertion order for non-numeric string keys).
type Result struct {
	Checks         []*Check
	TableNames     []string // captured by checkForTableName; used for duplicate detection
	IsMultiSite    bool     // OR of IsMultiSiteSQLDumpLine across every line
	LinesProcessed int
}

// newChecks constructs the check set for opts. Order mirrors Node's
// `checks` object literal in sql.ts:250, which is also its iteration order
// (V8 preserves insertion order for non-numeric string keys). Keys named in
// opts.SkipChecks are not registered, mirroring Node's filter in
// perLineValidations (sql.ts:538) and postValidation (sql.ts:418).
//
// Every regex is compiled from the Node source verbatim with the same flags
// (Go: `(?i)` for case-insensitive). I/O patterns where Node uses a string
// matcher (passed to String.prototype.match which silently wraps it in a
// dynamic RegExp) are translated to a Go RegExp here.
func newChecks(opts Options) []*Check {
	skip := make(map[string]bool, len(opts.SkipChecks))
	for _, key := range opts.SkipChecks {
		skip[key] = true
	}
	out := make([]*Check, 0, len(allChecks()))
	for _, c := range allChecks() {
		if !skip[c.Key] {
			out = append(out, c)
		}
	}
	return out
}

// allChecks builds every check Node declares, in Node's declaration order.
// Callers filter it via newChecks.
func allChecks() []*Check {
	return []*Check{
		// sql.ts:251-259 — binaryLogging
		//   matcher: /SET @@SESSION.sql_log_bin/i
		{
			Key:            "binaryLogging",
			Matcher:        regexp.MustCompile(`(?i)SET @@SESSION.sql_log_bin`),
			Message:        "SET @@SESSION.sql_log_bin statement",
			Recommendation: "Remove these lines",
			Formatter:      FormatterLineNumber,
			MatchHandler:   handlerLine,
		},
		// sql.ts:260-270 — trigger
		//   /^CREATE (\(?DEFINER=`?(\w*)(`@`)?(\w*\.*%?)*`?\)?)?(| )TRIGGER/i
		// Go's regexp (RE2) handles this directly.
		{
			Key:            "trigger",
			Matcher:        regexp.MustCompile("(?i)^CREATE (\\(?DEFINER=`?(\\w*)(`@`)?(\\w*\\.*%?)*`?\\)?)?(| )TRIGGER"),
			Message:        "TRIGGER statement",
			Recommendation: "Remove these lines",
			Formatter:      FormatterLineNumber,
			MatchHandler:   handlerLine,
		},
		// sql.ts:271-279 — dropDB
		//   /^DROP DATABASE/i
		{
			Key:            "dropDB",
			Matcher:        regexp.MustCompile(`(?i)^DROP DATABASE`),
			Message:        "DROP DATABASE statement",
			Recommendation: "Remove these lines",
			Formatter:      FormatterLineNumber,
			MatchHandler:   handlerLine,
		},
		// sql.ts:280-288 — useStatement. DEV_ENV_SPECIFIC_CHECKS, so every
		// platform caller skips it; the dev-env import registers it because
		// a `USE <db>` in the dump would point the import at a database
		// other than the environment's own.
		//   /^USE /i
		{
			Key:            CheckUseStatement,
			Matcher:        regexp.MustCompile(`(?i)^USE `),
			Message:        "USE <DATABASE_NAME> statement",
			Recommendation: "Remove these lines",
			Formatter:      FormatterLineNumber,
			MatchHandler:   handlerLine,
		},
		// sql.ts:289-297 — alterUser
		//   /^(ALTER USER|SET PASSWORD)/i
		{
			Key:            "alterUser",
			Matcher:        regexp.MustCompile(`(?i)^(ALTER USER|SET PASSWORD)`),
			Message:        "ALTER USER statement",
			Recommendation: "Remove these lines",
			Formatter:      FormatterLineNumber,
			MatchHandler:   handlerLine,
		},
		// sql.ts:298-306 — dropTable
		//   /^DROP TABLE IF EXISTS `?([a-z0-9_]*)/i
		//   matchHandler: results[1] -> {text: tableName}
		{
			Key:            "dropTable",
			Matcher:        regexp.MustCompile("(?i)^DROP TABLE IF EXISTS `?([a-z0-9_]*)"),
			Message:        "DROP TABLE",
			Recommendation: "Check import settings to include DROP TABLE statements",
			Formatter:      FormatterRequired,
			MatchHandler:   handlerText1,
		},
		// sql.ts:307-315 — createTable
		//   /^CREATE TABLE (?:IF NOT EXISTS )?`?([a-z0-9_]*)/i
		//   matchHandler: results[1] -> {text: tableName}
		{
			Key:            "createTable",
			Matcher:        regexp.MustCompile("(?i)^CREATE TABLE (?:IF NOT EXISTS )?`?([a-z0-9_]*)"),
			Message:        "CREATE TABLE",
			Recommendation: "Check import settings to include CREATE TABLE statements",
			Formatter:      FormatterRequired,
			MatchHandler:   handlerText1,
		},
		// sql.ts:316-325 — alterTable
		//   /^ALTER TABLE `?([a-z0-9_]*)/i
		{
			Key:     "alterTable",
			Matcher: regexp.MustCompile("(?i)^ALTER TABLE `?([a-z0-9_]*)"),
			Message: "ALTER TABLE statement",
			Recommendation: "Remove these lines and define table structure in the " +
				"CREATE TABLE statement instead",
			Formatter:    FormatterLineNumber,
			MatchHandler: handlerLine,
		},
		// sql.ts:326-334 — uniqueChecks
		//   /^SET UNIQUE_CHECKS\s*=\s*0/i
		{
			Key:            "uniqueChecks",
			Matcher:        regexp.MustCompile(`(?i)^SET UNIQUE_CHECKS\s*=\s*0`),
			Message:        "SET UNIQUE_CHECKS = 0",
			Recommendation: "Disabling 'UNIQUE_CHECKS' is not allowed. These lines should be removed",
			Formatter:      FormatterLineNumber,
			MatchHandler:   handlerLine,
		},
		// sql.ts:335-343 — siteHomeUrl
		//   matcher: `['"](siteurl|home)['"],\\s?['"](.*?)['"]`  (string ->
		//   dynamic RegExp; no /i flag, so case-sensitive in Node)
		//   matchHandler: {text: results[1] + ' ' + results[2]}
		{
			Key:            "siteHomeUrl",
			Matcher:        regexp.MustCompile(`['"](siteurl|home)['"],\s?['"](.*?)['"]`),
			Message:        "Siteurl/home matches",
			Recommendation: "",
			Formatter:      FormatterInfo,
			MatchHandler:   handlerSiteHomeURL,
		},
		// sql.ts:344-369 — siteHomeUrlLando. DEV_ENV_SPECIFIC_CHECKS, so the
		// platform never registers it. For dev-env it is the highest-value
		// check in the file: it catches a production dump whose siteurl/home
		// still points at production, which after import leaves the LOCAL
		// site redirecting to the live site.
		//
		//   matcher: `['"](siteurl|home)['"],\\s?['"]([^'"]+)['"]`
		//   (a STRING matcher -> dynamic RegExp with NO /i flag, so the
		//   option name is matched case-sensitively — unlike most checks.)
		//
		// NOTE Node marks every finding here `warning: true`, which makes
		// generalCheckFormatter skip `problemsFound += 1` — i.e. Node WARNS
		// and imports anyway. vip-next treats it as fatal; that severity
		// decision lives in the tier table in internal/devenv/importvalidate.go,
		// not here.
		{
			Key:            CheckSiteHomeURLLando,
			Matcher:        regexp.MustCompile(`['"](siteurl|home)['"],\s?['"]([^'"]+)['"]`),
			Message:        "Siteurl/home options not pointing to lando domain",
			Recommendation: "Use search-replace to change environment's domain",
			Formatter:      FormatterGeneral,
			MatchHandler:   handlerSiteHomeURLLando,
		},
		// sql.ts:370-380 — engineInnoDB
		//   /\sENGINE\s?=(?!(\s?InnoDB))/i  — has negative lookahead, NOT
		//   supported by RE2. Express the same intent with two-step matching:
		//   match ENGINE= then check the following token is NOT 'InnoDB'.
		//   See engineInnoDBMatcher below for the override.
		{
			Key:     "engineInnoDB",
			Matcher: nil, // sentinel: dispatch uses engineInnoDBMatch directly
			Message: "ENGINE != InnoDB",
			Recommendation: "Ensure your application works with InnoDB and update your SQL " +
				"dump to include only 'ENGINE=InnoDB' engine definitions in 'CREATE TABLE' " +
				"statements. We suggest you search for all 'ENGINE=X' entries and replace " +
				"them with 'ENGINE=InnoDB'!",
			Formatter:    FormatterLineNumber,
			MatchHandler: handlerLine,
		},
		// sql.ts:381-391 — autoIncrement
		//   /\s(NOT NULL AUTO_INCREMENT,)/i
		//   matchHandler: {text: results[1]}
		{
			Key:     "autoIncrement",
			Matcher: regexp.MustCompile(`(?i)\s(NOT NULL AUTO_INCREMENT,)`),
			Message: "AUTO_INCREMENT attribute",
			Recommendation: "Check import settings to include AUTO_INCREMENT attribute in all " +
				"the CREATE TABLE statements",
			Formatter:    FormatterRequired,
			MatchHandler: handlerText1,
		},
	}
}

// handlerLine is the lineNumber matchHandler used by 8 of the checks.
func handlerLine(lineNum int, _ []string, _ string) CheckResult {
	return CheckResult{Line: lineNum}
}

// handlerText1 captures results[1] from the match. Used by dropTable,
// createTable, autoIncrement.
func handlerText1(_ int, matches []string, _ string) CheckResult {
	if len(matches) < 2 {
		return CheckResult{}
	}
	return CheckResult{Text: matches[1]}
}

// handlerSiteHomeURL builds "<key> <value>" from results[1] and results[2].
// Used by siteHomeUrl.
func handlerSiteHomeURL(_ int, matches []string, _ string) CheckResult {
	if len(matches) < 3 {
		return CheckResult{}
	}
	return CheckResult{Text: matches[1] + " " + matches[2]}
}

// httpSchemePrefix / httpSchemePrefixCI port the TWO different regexes Node
// uses back-to-back on the same value in siteHomeUrlLando's matchHandler
// (sql.ts:348 and :351): the guard test is case-INsensitive, the strip is
// case-SENSITIVE. That asymmetry is Node's, and it is load-bearing for the
// output: `HTTP://EXAMPLE.COM` passes the guard but keeps its scheme through
// the strip, so the recommendation Node prints (and we print) names
// `HTTP://EXAMPLE.COM` rather than the bare host. Ported verbatim rather than
// "fixed" so both CLIs recommend the same --search-replace string.
var (
	httpSchemePrefixCI = regexp.MustCompile(`(?i)^https?://`)
	httpSchemePrefix   = regexp.MustCompile(`^https?://`)
)

// handlerSiteHomeURLLando ports sql.ts:346-363. extraParam is the expected
// local domain ("<slug>.<domain>"); an empty one would make every absolute
// URL a finding, so callers must supply it.
func handlerSiteHomeURLLando(lineNum int, matches []string, expectedDomain string) CheckResult {
	if len(matches) < 3 {
		return CheckResult{FalsePositive: true}
	}
	found := matches[2]
	// Node: if ( ! /^https?:\/\//i.test( foundDomain ) ) return falsePositive
	if !httpSchemePrefixCI.MatchString(found) {
		return CheckResult{FalsePositive: true}
	}
	// Node: foundDomain = foundDomain.replace( /^https?:\/\//, '' )
	found = httpSchemePrefix.ReplaceAllString(found, "")
	// Node: if ( ! foundDomain.trim() ) return falsePositive
	if strings.TrimSpace(found) == "" {
		return CheckResult{FalsePositive: true}
	}
	// Node: if ( foundDomain.includes( expectedDomain ) ) return falsePositive
	if strings.Contains(found, expectedDomain) {
		return CheckResult{FalsePositive: true}
	}
	return CheckResult{
		Line:           lineNum,
		Recommendation: `Use '--search-replace="` + found + "," + expectedDomain + `"' switch to replace the domain`,
	}
}

// engineInnoDBHasMatch checks whether a line should be flagged as
// non-InnoDB. Replicates Node's /\sENGINE\s?=(?!(\s?InnoDB))/i which uses
// a negative lookahead RE2 cannot express. We approximate: find every
// `<space>ENGINE<optional space>=` occurrence and inspect what follows.
var engineInnoDBPrefix = regexp.MustCompile(`(?i)\sENGINE\s?=`)

func engineInnoDBMatch(line string) bool {
	indexes := engineInnoDBPrefix.FindAllStringIndex(line, -1)
	for _, idx := range indexes {
		tail := line[idx[1]:]
		// Node's negative lookahead: NOT followed by (optional space + "InnoDB")
		trimmed := tail
		if len(trimmed) > 0 && trimmed[0] == ' ' {
			trimmed = trimmed[1:]
		}
		if !strings.HasPrefix(strings.ToLower(trimmed), "innodb") {
			return true
		}
	}
	return false
}

// checkForTableNamePattern mirrors sql.ts:514 — captures the wp_-prefixed
// table name from a CREATE TABLE line:
//
//	/(?<=^CREATE\sTABLE\s)`?(?:(wp_[\d+_]?\w+))`?/
//
// RE2 lacks lookbehind; we anchor on ^CREATE TABLE and use a capturing
// group instead. The Node regex is case-sensitive (no /i flag).
//
// Bug-for-bug parity note: the `[\d+_]?` character class in Node almost
// certainly was meant to be `(\d+_)?` (a digit-run followed by underscore,
// the multisite-prefix shape). Inside a character class the `+` is a
// literal `+`, not a quantifier. We mirror the Node regex verbatim so the
// output stays byte-identical; do NOT "fix" this character class without
// also updating Node upstream — see vip-cli sql.ts:514.
var checkForTableNamePattern = regexp.MustCompile(
	"^CREATE TABLE `?(wp_[\\d+_]?\\w+)`?",
)

func checkForTableName(line string) (string, bool) {
	m := checkForTableNamePattern.FindStringSubmatch(line)
	if m == nil || len(m) < 2 {
		return "", false
	}
	return m[1], true
}

// Validate scans r line-by-line and returns the accumulated check results
// + table-name list + multisite flag. Mirrors Node's validate() body in
// sql.ts:570 (minus the post-validation reporting pass, which the handler
// performs against this Result).
//
// PLATFORM semantics: isImport=false, skipChecks=DEV_ENV_SPECIFIC_CHECKS,
// extraCheckParams={} — i.e. PlatformOptions(). `vip import validate-sql`
// and `vip import sql` must keep using this (or ValidateWithLineHook), which
// is what guarantees they never run useStatement or siteHomeUrlLando.
func Validate(r io.Reader) (*Result, error) {
	return ValidateWithLineHook(r, nil)
}

// ValidateWithLineHook is Validate with an optional per-line callback,
// letting `vip import sql` run its site-type capture (wp_site INSERT
// statements, multisite heuristics) and the "Reading line N" ticker in
// the same streaming pass Node's fileLineValidations performs
// (line-by-line.ts:51 dispatches every registered validation per line).
func ValidateWithLineHook(r io.Reader, hook func(line string, lineNum int)) (*Result, error) {
	return ValidateWith(r, PlatformOptions(), hook)
}

// ValidateWith is the general entry point: it honours opts.SkipChecks and
// opts.ExtraCheckParams. The dev-env import path uses it to register the two
// DEV_ENV_SPECIFIC_CHECKS Node turns on there (dev-env-import-sql.ts:96).
func ValidateWith(r io.Reader, opts Options, hook func(line string, lineNum int)) (*Result, error) {
	res := &Result{Checks: newChecks(opts)}

	err := ScanLines(r, func(line string, lineNum int) error {
		if hook != nil {
			hook(line, lineNum)
		}
		res.LinesProcessed = lineNum

		// Multi-site detection: OR'd across every line, like Node's separate
		// pass over the dump in callers that use sqlDumpLineIsMultiSite.
		if !res.IsMultiSite && IsMultiSiteSQLDumpLine(line) {
			res.IsMultiSite = true
		}

		// Per Node's checkForTableName (sql.ts:513), only the wp_-prefixed
		// CREATE TABLE name is captured into tableNames for duplicate
		// detection — not every table.
		if name, ok := checkForTableName(line); ok {
			res.TableNames = append(res.TableNames, name)
		}

		for _, check := range res.Checks {
			extraParam := opts.ExtraCheckParams[check.Key]
			// engineInnoDB uses a custom matcher because Node's pattern uses
			// a negative lookahead RE2 can't express directly.
			if check.Key == "engineInnoDB" {
				if engineInnoDBMatch(line) {
					check.Results = append(check.Results, check.MatchHandler(lineNum, nil, extraParam))
				}
				continue
			}
			m := check.Matcher.FindStringSubmatch(line)
			if m != nil {
				check.Results = append(check.Results, check.MatchHandler(lineNum, m, extraParam))
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

// ValidateFile opens path and delegates to Validate (platform semantics).
// The caller is responsible for surfacing open errors with the Node-parity
// wording.
func ValidateFile(path string) (*Result, error) {
	return ValidateFileWith(path, PlatformOptions())
}

// ValidateFileWith opens path and delegates to ValidateWith.
func ValidateFileWith(path string, opts Options) (*Result, error) {
	f, err := os.Open(path) // #nosec G304 -- path is a user-supplied CLI arg
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return ValidateWith(f, opts, nil)
}

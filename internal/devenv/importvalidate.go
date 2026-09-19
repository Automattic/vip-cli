package devenv

import (
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"

	"github.com/fatih/color"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/sqlvalidation"
)

// SQL validation for `vip dev-env import sql`.
//
// Node runs the same check suite the platform runs, with two differences
// (src/commands/dev-env-import-sql.ts:83-100):
//
//   - skipChecks is `[]` for a mysqldump, which OVERRIDES
//     DEFAULT_VALIDATION_OPTIONS.skipChecks (= DEV_ENV_SPECIFIC_CHECKS), so the
//     dev-env path runs the two checks `vip import validate-sql` deliberately
//     skips: useStatement and siteHomeUrlLando.
//   - a MyDumper dump skips [ 'dropTable', 'dropDB' ].
//
// It then hard-fails on every finding. vip-next does NOT: see devEnvSQLTiers.

// tier is the severity vip-next assigns a dev-env SQL finding.
type tier int

const (
	// tierFatal blocks the import: non-zero exit, nothing written to the DB.
	tierFatal tier = iota
	// tierWarning prints and continues: exit 0, the import runs.
	tierWarning
	// tierInfo prints only in the informational summary.
	tierInfo
)

// Synthetic tier keys for the two findings that are not checks of their own:
// sub-classifiers Node runs inside postValidation.
const (
	// tierKeyTablePrefix is the wp_ / wp_<n>_ / non-wp_ classification
	// requiredCheckFormatter runs on createTable's results (sql.ts:182-186,
	// only when isImport === false — which the dev-env path is).
	tierKeyTablePrefix = "tablePrefix"
	// tierKeyDuplicateTables is postValidation's duplicate-table-name scan
	// (sql.ts:442-456).
	tierKeyDuplicateTables = "duplicateTables"
)

// devEnvSQLTiers is THE severity table for `vip dev-env import sql`. It is the
// single place severity is decided; nothing else in this package or in
// internal/sqlvalidation encodes "does this block?".
//
// DIVERGENCE FROM NODE (cutover register): Node hard-fails on all of these
// except siteHomeUrlLando. vip-next tiers them, because most of Node's checks
// encode VIP *Platform* policy that is meaningless on a local Docker container:
// refusing to import a dump into the user's own laptop because it uses MyISAM
// helps nobody. The rule applied below is: does the statement damage or
// misdirect the LOCAL environment (fatal), or is it a hosting-platform rule
// (warning)?
//
// FATAL — the import is stopped:
//
//	dropDB           DROP DATABASE destroys the environment's database.
//	useStatement     USE <db> points the import at a database that is not the
//	                 environment's, so the data lands somewhere unexpected.
//	siteHomeUrlLando siteurl/home still names another host: the LOCAL site
//	                 would redirect to it (usually production). This is the
//	                 highest-value check on this path, and the one place we are
//	                 STRICTER than Node — Node marks its results `warning: true`
//	                 (sql.ts:359) so problemsFound never increments and the
//	                 import proceeds with a silently broken local site.
//	alterUser        ALTER USER / SET PASSWORD rewrites the container MySQL
//	                 credentials that compose hardcodes, breaking the env's DB
//	                 access. Same class as useStatement: it misconfigures the
//	                 local server rather than violating a platform rule.
//	                 (Not named in the tiering brief; classified here by the
//	                 same rule, and called out in the handover for review.)
//	createTable      \
//	dropTable         > Node's "required" checks (requiredCheckFormatter):
//	autoIncrement    /  ABSENCE is the failure. They assert the dump is a whole
//	                    dump and not a truncated or partial one — importing
//	                    half a dump over a working DB is worse than not
//	                    importing at all.
//	duplicateTables  The dump contradicts itself; the later CREATE wins and the
//	                 earlier table's rows are lost.
//
// WARNING — printed, import proceeds:
//
//	engineInnoDB  MyISAM works fine in the local MariaDB container.
//	alterTable    "define the structure in CREATE TABLE instead" is a style rule.
//	uniqueChecks  SET UNIQUE_CHECKS=0 is a standard mysqldump speed optimization.
//	binaryLogging Replication/binlog infrastructure concern; local has no replicas.
//	trigger       A VIP Platform restriction, not a MySQL one.
//	tablePrefix   `wp_` naming is VIP Platform policy; a local WP install runs
//	              happily with any prefix.
//
// INFO — summary only:
//
//	siteHomeUrl   Node's infoCheckFormatter: reports the siteurl/home values it
//	              saw. Never a finding.
var devEnvSQLTiers = map[string]tier{
	"dropDB":                            tierFatal,
	sqlvalidation.CheckUseStatement:     tierFatal,
	sqlvalidation.CheckSiteHomeURLLando: tierFatal,
	"alterUser":                         tierFatal,
	"createTable":                       tierFatal,
	"dropTable":                         tierFatal,
	"autoIncrement":                     tierFatal,
	tierKeyDuplicateTables:              tierFatal,

	"engineInnoDB":     tierWarning,
	"alterTable":       tierWarning,
	"uniqueChecks":     tierWarning,
	"binaryLogging":    tierWarning,
	"trigger":          tierWarning,
	tierKeyTablePrefix: tierWarning,

	"siteHomeUrl": tierInfo,
}

// tierOf returns the configured tier for a check key. An unlisted key is
// treated as fatal (fail closed) — TestDevEnvSQLTierTableCoversEveryRegisteredCheck
// makes sure that never actually happens.
func tierOf(key string) tier {
	if t, ok := devEnvSQLTiers[key]; ok {
		return t
	}
	return tierFatal
}

// sqlValidationInput is everything the dev-env SQL validation needs.
type sqlValidationInput struct {
	// Path is the file that will actually be imported — i.e. AFTER any
	// file-level search-replace, matching Node's `resolvedPath`.
	Path string
	// ExpectedDomain is "<slug>.<domain>", the host the local site serves.
	ExpectedDomain string
	// IsMyDumper selects Node's skipChecks:['dropTable','dropDB'] branch.
	IsMyDumper bool
	// HasSearchReplace reports whether the user supplied --search-replace
	// pairs. It only matters for a MyDumper dump — see below.
	HasSearchReplace bool
	// Quiet suppresses the informational report (header + ✅ summary).
	// Warnings and the fatal block are never suppressed.
	Quiet bool
}

// devEnvValidationOptions builds the sqlvalidation options for a dev-env
// import. Ports dev-env-import-sql.ts:96-100.
func devEnvValidationOptions(expectedDomain string, skip []string) sqlvalidation.Options {
	return sqlvalidation.Options{
		// Node passes skipChecks:[] for a mysqldump, which is what turns the
		// two DEV_ENV_SPECIFIC_CHECKS back on for this path only.
		SkipChecks: skip,
		ExtraCheckParams: map[string]string{
			sqlvalidation.CheckSiteHomeURLLando: expectedDomain,
		},
	}
}

// skipChecksFor mirrors Node's `isMyDumper ? [ 'dropTable', 'dropDB' ] : []`
// plus one vip-next-only addition.
func skipChecksFor(in sqlValidationInput) []string {
	if !in.IsMyDumper {
		return nil
	}
	// Node: a MyDumper stream contains neither statement.
	skip := []string{"dropTable", "dropDB"}
	if in.HasSearchReplace {
		// vip-next-only. Node rewrites a MyDumper dump on disk before
		// validating it (resolveImportPath), so by validation time the URLs are
		// already local. vip-next deliberately does NOT rewrite a MyDumper file
		// — that invalidates the per-file byte markers `myloader --stream`
		// depends on — and runs `wp search-replace` on the live DB after the
		// import instead. The file therefore still carries the source domain at
		// validation time, so keeping the check here would fail every correct
		// MyDumper + --search-replace import. With no pairs supplied nothing
		// will fix the domain, so the check stays on.
		skip = append(skip, sqlvalidation.CheckSiteHomeURLLando)
	}
	return skip
}

// validateDevEnvSQL runs the tiered validation and renders the report to out.
// It returns a non-nil error — carrying the full, already-formatted error block
// — when a FATAL finding was made; the caller must not import in that case.
func validateDevEnvSQL(in sqlValidationInput, out io.Writer) error {
	res, err := sqlvalidation.ValidateFileWith(in.Path, devEnvValidationOptions(in.ExpectedDomain, skipChecksFor(in)))
	if err != nil {
		return err
	}

	var fatals, warnings []finding
	var infos []string
	problems := 0

	add := func(key string, found []finding) {
		if len(found) == 0 {
			return
		}
		switch tierOf(key) {
		case tierFatal:
			// Node's problemsFound counts CHECKS, not findings
			// (sql.ts:122,180,188) — one offending check is one error.
			problems++
			fatals = append(fatals, found...)
		case tierWarning:
			warnings = append(warnings, found...)
		case tierInfo:
			for _, f := range found {
				infos = append(infos, f.Message)
			}
		}
	}

	for _, check := range res.Checks {
		found, checkInfos, prefixFindings := formatDevEnvCheck(check)
		add(check.Key, found)
		add(tierKeyTablePrefix, prefixFindings)
		infos = append(infos, checkInfos...)
	}

	// postValidation's duplicate-table scan (sql.ts:442-456).
	if dups := duplicateTableNames(res.TableNames); len(dups) > 0 {
		add(tierKeyDuplicateTables, []finding{{
			Message:        "Duplicate table names were found: " + strings.Join(dups, ","),
			Recommendation: "Ensure that there are no duplicate tables in your SQL dump",
		}})
	}

	if !in.Quiet {
		// Node sql.ts:412-415 — the dev-env path calls validate() with
		// isImport:false, so the line counter and the ✅ summary both print.
		fmt.Fprintf(out, "Finished processing %d lines.\n\n", res.LinesProcessed)
	}

	if len(warnings) > 0 {
		// Yellow "Warning:" against the fatal block's red "SQL Error:", plus an
		// explicit statement that nothing was blocked.
		fmt.Fprintln(out, strings.Join(renderFindings(warningLabel, warnings), "\n"))
		fmt.Fprintln(out, color.YellowString(
			"%s did not block the import: they are VIP Platform rules that do not apply to a local environment.",
			pluralize(len(warnings), "warning above", "warnings above")))
		fmt.Fprintln(out)
	}

	if problems > 0 {
		return fmt.Errorf("%s\n%s\n\nIf you are confident that the file does not contain unsupported statements, you can retry the command with the %s option.",
			strings.Join(renderFindings(errorLabel, fatals), "\n"),
			color.New(color.FgRed, color.Bold).Sprint(
				"SQL validation failed due to "+strconv.Itoa(problems)+" error(s)"),
			color.YellowString("--skip-validate"))
	}

	if !in.Quiet && len(infos) > 0 {
		fmt.Fprintln(out, strings.Join(infos, "\n"))
		fmt.Fprintln(out)
	}
	return nil
}

// finding is one rendered problem, kept label-free so the SAME structure can be
// printed as a fatal ("SQL Error:") or as a warning ("Warning:") depending on
// its tier. The label is applied once, at print time, by renderFindings.
type finding struct {
	Message        string
	Recommendation string
}

// formatDevEnvCheck renders one check into (findings, infos, prefixFindings).
// findings/prefixFindings are attributed to a tier by the caller; infos always
// go to the informational summary. Mirrors the four Node formatters
// (sql.ts:116-215) minus their problemsFound bookkeeping, which the tier table
// replaces.
func formatDevEnvCheck(c *sqlvalidation.Check) (findings []finding, infos []string, prefixFindings []finding) {
	switch c.Formatter {
	case sqlvalidation.FormatterLineNumber:
		// lineNumberCheckFormatter (sql.ts:150).
		if len(c.Results) == 0 {
			return nil, []string{"✅ " + c.Message + " was found 0 times."}, nil
		}
		lines := make([]string, len(c.Results))
		for i, r := range c.Results {
			lines[i] = strconv.Itoa(r.Line)
		}
		return []finding{{
			Message:        c.Message + " on line(s) " + strings.Join(lines, ", ") + ".",
			Recommendation: c.Recommendation,
		}}, nil, nil

	case sqlvalidation.FormatterRequired:
		// requiredCheckFormatter (sql.ts:171) — inverted: absence is the problem.
		if len(c.Results) == 0 {
			return []finding{{
				Message:        c.Message + " was not found.",
				Recommendation: c.Recommendation,
			}}, nil, nil
		}
		infos = []string{fmt.Sprintf("✅ %s was found %d times.", c.Message, len(c.Results))}
		if c.Key == "createTable" {
			// Node runs checkTablePrefixes only when isImport === false, and
			// the dev-env path passes isImport:false (dev-env-import-sql.ts:97).
			prefixErrs, prefixInfos := checkDevEnvTablePrefixes(c.Results)
			infos = append(infos, prefixInfos...)
			prefixFindings = prefixErrs
		}
		return nil, infos, prefixFindings

	case sqlvalidation.FormatterInfo:
		// infoCheckFormatter (sql.ts:202).
		for _, r := range c.Results {
			if r.Text != "" {
				infos = append(infos, r.Text)
			}
		}
		return nil, infos, nil

	case sqlvalidation.FormatterGeneral:
		// generalCheckFormatter (sql.ts:116) — drops falsePositives, then one
		// line per surviving result with that result's own recommendation.
		var valid []sqlvalidation.CheckResult
		for _, r := range c.Results {
			if !r.FalsePositive {
				valid = append(valid, r)
			}
		}
		if len(valid) == 0 {
			return nil, []string{"✅ " + c.Message + " was found 0 times."}, nil
		}
		for _, r := range valid {
			rec := r.Recommendation
			if rec == "" {
				rec = c.Recommendation
			}
			findings = append(findings, finding{
				// Node's generalCheckFormatter says "on line N." (singular),
				// unlike lineNumberCheckFormatter's "on line(s) …".
				Message:        fmt.Sprintf("%s on line %d.", c.Message, r.Line),
				Recommendation: rec,
			})
		}
		return findings, nil, nil
	}
	return nil, nil, nil
}

// wpMultisitePrefix mirrors Node sql.ts:223's /^wp_(\d+_)/.
var wpMultisitePrefix = regexp.MustCompile(`^wp_\d+_`)

// checkDevEnvTablePrefixes ports checkTablePrefixes (sql.ts:217).
func checkDevEnvTablePrefixes(results []sqlvalidation.CheckResult) (findings []finding, infos []string) {
	var wpTables, notWPTables, multisiteTables []string
	for _, r := range results {
		switch {
		case wpMultisitePrefix.MatchString(r.Text):
			multisiteTables = append(multisiteTables, r.Text)
		case strings.HasPrefix(r.Text, "wp_"):
			wpTables = append(wpTables, r.Text)
		default:
			notWPTables = append(notWPTables, r.Text)
		}
	}
	if len(wpTables) > 0 {
		infos = append(infos, fmt.Sprintf(" - wp_ prefix tables found: %d ", len(wpTables)))
	}
	if len(notWPTables) > 0 {
		findings = append(findings, finding{
			Message:        "tables without wp_ prefix found: " + strings.Join(notWPTables, ","),
			Recommendation: "Please make sure all table names are prefixed with `wp_`",
		})
	}
	if len(multisiteTables) > 0 {
		infos = append(infos, fmt.Sprintf(" - wp_n_ prefix tables found: %d ", len(multisiteTables)))
	}
	return findings, infos
}

// duplicateTableNames returns the names that appear more than once, in first
// appearance order. Ports findDuplicates (sql.ts:396).
func duplicateTableNames(names []string) []string {
	counts := map[string]int{}
	for _, n := range names {
		counts[n]++
	}
	var out []string
	emitted := map[string]bool{}
	for _, n := range names {
		if counts[n] > 1 && !emitted[n] {
			out = append(out, n)
			emitted[n] = true
		}
	}
	return out
}

// errorLabel / warningLabel / formatRecommendation mirror the chalk wrappers in
// sql.ts:19-29. The two tiers are visually distinguished purely by the label a
// finding is rendered with: red "SQL Error:" vs yellow "Warning:".
func errorLabel(msg string) string   { return color.RedString("SQL Error:") + " " + msg }
func warningLabel(msg string) string { return color.YellowString("Warning:") + " " + msg }

func formatRecommendation(m string) string { return color.YellowString("Recommendation:") + " " + m }

// renderFindings expands findings into Node's three-line-per-problem layout:
// the labelled message, the recommendation, and a blank separator
// (sql.ts:460-468 for warnings, :480-488 for errors).
func renderFindings(label func(string) string, found []finding) []string {
	out := make([]string, 0, len(found)*3)
	for _, f := range found {
		out = append(out, label(f.Message), formatRecommendation(f.Recommendation), "")
	}
	return out
}

func pluralize(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return strconv.Itoa(n) + " " + many
}

// devEnvDomain resolves the domain the environment actually serves, using the
// same resolution as the rest of the dev-env code (see runDevEnvSyncSQL):
// instance data pins it for new envs, and instancedata.Read backfills a legacy
// env's empty value to LegacyDomain. A missing/unreadable instance file falls
// back to the default so validation still has something to compare against.
func devEnvDomain(slug string) string {
	if d, err := instancedata.Read(slug); err == nil && d.Domain != "" {
		return d.Domain
	}
	return compose.DefaultDomain
}

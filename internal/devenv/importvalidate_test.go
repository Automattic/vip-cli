package devenv

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/sqlvalidation"
)

// cleanDump is a minimal dump that passes every FATAL dev-env check: it has
// DROP TABLE + CREATE TABLE + AUTO_INCREMENT (the three "required" checks,
// where ABSENCE is the failure), an InnoDB engine, no USE/DROP DATABASE, and
// a siteurl already pointing at the local environment.
func cleanDump(t *testing.T, domain string) string {
	t.Helper()
	return writeSQL(t, strings.Join([]string{
		"-- MySQL dump 10.13",
		"DROP TABLE IF EXISTS `wp_options`;",
		"CREATE TABLE `wp_options` (",
		"  `option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,",
		"  PRIMARY KEY (`option_id`)",
		") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
		"INSERT INTO `wp_options` VALUES (1,'siteurl','https://" + domain + "');",
	}, "\n")+"\n")
}

func writeSQL(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "dump.sql")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

// The tier table must be exhaustive. A check registered by the dev-env option
// set with no entry would silently get whatever the zero value happens to be —
// exactly the "severity scattered around" failure the table exists to prevent.
func TestDevEnvSQLTierTableCoversEveryRegisteredCheck(t *testing.T) {
	res, err := sqlvalidation.ValidateWith(strings.NewReader(""), devEnvValidationOptions("e.vipdev.site", nil), nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range res.Checks {
		if _, ok := devEnvSQLTiers[c.Key]; !ok {
			t.Errorf("check %q has no entry in devEnvSQLTiers", c.Key)
		}
	}
	// And no stale entries for checks that no longer exist.
	known := map[string]bool{tierKeyTablePrefix: true, tierKeyDuplicateTables: true}
	for _, c := range res.Checks {
		known[c.Key] = true
	}
	for key := range devEnvSQLTiers {
		if !known[key] {
			t.Errorf("devEnvSQLTiers has a stale entry %q", key)
		}
	}
}

func TestDevEnvSQLValidationAcceptsCleanDump(t *testing.T) {
	var out bytes.Buffer
	err := validateDevEnvSQL(sqlValidationInput{
		Path:           cleanDump(t, "e.vipdev.site"),
		ExpectedDomain: "e.vipdev.site",
	}, &out)
	if err != nil {
		t.Fatalf("clean dump rejected: %v\noutput:\n%s", err, out.String())
	}
	if !strings.Contains(out.String(), "Finished processing 7 lines.") {
		t.Errorf("missing Node's line-count header, got:\n%s", out.String())
	}
}

// The FATAL tier: each of these must block the import.
func TestDevEnvSQLValidationFatalChecks(t *testing.T) {
	cases := []struct {
		name string
		sql  string
		want string
	}{
		{"dropDB", "DROP DATABASE wordpress;", "DROP DATABASE statement on line(s) 1."},
		{"useStatement", "USE some_other_db;", "USE <DATABASE_NAME> statement on line(s) 1."},
		{"alterUser", "ALTER USER 'wordpress'@'%' IDENTIFIED BY 'x';", "ALTER USER statement on line(s) 1."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Append the offending line to an otherwise-clean dump so the
			// required checks are satisfied and only this one fires.
			body, err := os.ReadFile(cleanDump(t, "e.vipdev.site")) // #nosec G304
			if err != nil {
				t.Fatal(err)
			}
			path := writeSQL(t, tc.sql+"\n"+string(body))

			var out bytes.Buffer
			verr := validateDevEnvSQL(sqlValidationInput{Path: path, ExpectedDomain: "e.vipdev.site"}, &out)
			if verr == nil {
				t.Fatalf("%s did not block the import; output:\n%s", tc.name, out.String())
			}
			if !strings.Contains(verr.Error(), tc.want) {
				t.Errorf("error =\n%s\nwant it to contain %q", verr.Error(), tc.want)
			}
			if !strings.Contains(verr.Error(), "SQL validation failed due to 1 error(s)") {
				t.Errorf("missing Node's footer, got:\n%s", verr.Error())
			}
		})
	}
}

// The "required" checks invert: absence is the failure. A truncated dump that
// contains none of them must not be imported.
func TestDevEnvSQLValidationRequiredChecksBlockWhenAbsent(t *testing.T) {
	path := writeSQL(t, "-- MySQL dump 10.13\nINSERT INTO `wp_options` VALUES (1,'a','b');\n")
	var out bytes.Buffer
	err := validateDevEnvSQL(sqlValidationInput{Path: path, ExpectedDomain: "e.vipdev.site"}, &out)
	if err == nil {
		t.Fatalf("a dump with no DROP TABLE / CREATE TABLE / AUTO_INCREMENT was accepted; output:\n%s", out.String())
	}
	for _, want := range []string{
		"DROP TABLE was not found.",
		"CREATE TABLE was not found.",
		"AUTO_INCREMENT attribute was not found.",
		"SQL validation failed due to 3 error(s)",
	} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error missing %q; got:\n%s", want, err.Error())
		}
	}
}

// The single most valuable dev-env check: a production dump imported without a
// search-replace leaves the LOCAL site pointing at production.
func TestDevEnvSQLValidationSiteHomeURLLandoIsFatalWithFlagAdvice(t *testing.T) {
	path := writeSQL(t, strings.Join([]string{
		"DROP TABLE IF EXISTS `wp_options`;",
		"CREATE TABLE `wp_options` (`option_id` bigint(20) NOT NULL AUTO_INCREMENT, PRIMARY KEY (`option_id`)) ENGINE=InnoDB;",
		"INSERT INTO `wp_options` VALUES (1,'siteurl','https://example.com');",
	}, "\n")+"\n")

	var out bytes.Buffer
	err := validateDevEnvSQL(sqlValidationInput{Path: path, ExpectedDomain: "e.vipdev.site"}, &out)
	if err == nil {
		t.Fatalf("a production siteurl was accepted; output:\n%s", out.String())
	}
	for _, want := range []string{
		"Siteurl/home options not pointing to lando domain on line 3.",
		`Use '--search-replace="example.com,e.vipdev.site"' switch to replace the domain`,
	} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error missing %q; got:\n%s", want, err.Error())
		}
	}
}

// The WARNING tier: printed, but the import proceeds and the output says so.
func TestDevEnvSQLValidationWarningsDoNotBlock(t *testing.T) {
	path := writeSQL(t, strings.Join([]string{
		"SET UNIQUE_CHECKS = 0;",
		"SET @@SESSION.sql_log_bin = 0;",
		"DROP TABLE IF EXISTS `wp_options`;",
		"CREATE TABLE `wp_options` (`option_id` bigint(20) NOT NULL AUTO_INCREMENT, PRIMARY KEY (`option_id`)) ENGINE=MyISAM;",
		"ALTER TABLE `wp_options` ADD COLUMN x INT;",
		"INSERT INTO `wp_options` VALUES (1,'siteurl','https://e.vipdev.site');",
	}, "\n")+"\n")

	var out bytes.Buffer
	if err := validateDevEnvSQL(sqlValidationInput{Path: path, ExpectedDomain: "e.vipdev.site"}, &out); err != nil {
		t.Fatalf("warnings must not block the import, got: %v", err)
	}
	got := out.String()
	for _, want := range []string{
		"Warning: SET UNIQUE_CHECKS = 0 on line(s) 1.",
		"Warning: SET @@SESSION.sql_log_bin statement on line(s) 2.",
		"Warning: ENGINE != InnoDB on line(s) 4.",
		"Warning: ALTER TABLE statement on line(s) 5.",
		"did not block the import",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("output missing %q; got:\n%s", want, got)
		}
	}
	if strings.Contains(got, "SQL Error:") {
		t.Errorf("warning-only run emitted fatal formatting:\n%s", got)
	}
}

// Node skips dropTable and dropDB for a MyDumper dump (dev-env-import-sql.ts:98)
// because a MyDumper stream carries neither.
func TestDevEnvSQLValidationMyDumperSkipsDropChecks(t *testing.T) {
	path := writeSQL(t, strings.Join([]string{
		"DROP DATABASE wordpress;",
		"CREATE TABLE `wp_options` (`option_id` bigint(20) NOT NULL AUTO_INCREMENT, PRIMARY KEY (`option_id`)) ENGINE=InnoDB;",
		"INSERT INTO `wp_options` VALUES (1,'siteurl','https://e.vipdev.site');",
	}, "\n")+"\n")

	var out bytes.Buffer
	if err := validateDevEnvSQL(sqlValidationInput{
		Path: path, ExpectedDomain: "e.vipdev.site", IsMyDumper: true,
	}, &out); err != nil {
		t.Fatalf("MyDumper must skip dropTable/dropDB, got: %v", err)
	}
}

// vip-next does NOT file-level search-replace a MyDumper dump (that would
// invalidate the per-file byte markers myloader's --stream relies on); it runs
// `wp search-replace` on the live DB AFTER the import instead. So a MyDumper
// dump's siteurl still names the source domain at validation time even when the
// user did supply --search-replace, and flagging it would be a guaranteed false
// positive on the normal workflow.
func TestDevEnvSQLValidationMyDumperWithSearchReplaceSkipsSiteHomeURLLando(t *testing.T) {
	path := writeSQL(t, strings.Join([]string{
		"CREATE TABLE `wp_options` (`option_id` bigint(20) NOT NULL AUTO_INCREMENT, PRIMARY KEY (`option_id`)) ENGINE=InnoDB;",
		"INSERT INTO `wp_options` VALUES (1,'siteurl','https://example.com');",
	}, "\n")+"\n")

	var out bytes.Buffer
	if err := validateDevEnvSQL(sqlValidationInput{
		Path: path, ExpectedDomain: "e.vipdev.site", IsMyDumper: true, HasSearchReplace: true,
	}, &out); err != nil {
		t.Fatalf("MyDumper + --search-replace must not trip siteHomeUrlLando, got: %v", err)
	}

	// …but with NO search-replace pairs nothing will fix the domain, so the
	// check is meaningful and must still fire.
	out.Reset()
	if err := validateDevEnvSQL(sqlValidationInput{
		Path: path, ExpectedDomain: "e.vipdev.site", IsMyDumper: true,
	}, &out); err == nil {
		t.Error("MyDumper with no search-replace must still flag a foreign siteurl")
	}
}

// The wp_-prefix classifier is VIP naming policy, not a local hazard: it warns.
func TestDevEnvSQLValidationTablePrefixWarnsOnly(t *testing.T) {
	path := writeSQL(t, strings.Join([]string{
		"DROP TABLE IF EXISTS `custom_table`;",
		"CREATE TABLE `custom_table` (`id` bigint(20) NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`)) ENGINE=InnoDB;",
	}, "\n")+"\n")

	var out bytes.Buffer
	if err := validateDevEnvSQL(sqlValidationInput{Path: path, ExpectedDomain: "e.vipdev.site"}, &out); err != nil {
		t.Fatalf("a non-wp_ table name must not block a LOCAL import, got: %v", err)
	}
	if !strings.Contains(out.String(), "tables without wp_ prefix found: custom_table") {
		t.Errorf("expected a prefix warning, got:\n%s", out.String())
	}
}

// Duplicate table names mean the dump itself is broken — the second CREATE
// wins and the first table's data is lost.
func TestDevEnvSQLValidationDuplicateTablesAreFatal(t *testing.T) {
	path := writeSQL(t, strings.Join([]string{
		"DROP TABLE IF EXISTS `wp_options`;",
		"CREATE TABLE `wp_options` (`option_id` bigint(20) NOT NULL AUTO_INCREMENT, PRIMARY KEY (`option_id`)) ENGINE=InnoDB;",
		"CREATE TABLE `wp_options` (`option_id` bigint(20) NOT NULL AUTO_INCREMENT, PRIMARY KEY (`option_id`)) ENGINE=InnoDB;",
	}, "\n")+"\n")

	var out bytes.Buffer
	err := validateDevEnvSQL(sqlValidationInput{Path: path, ExpectedDomain: "e.vipdev.site"}, &out)
	if err == nil {
		t.Fatal("a dump with duplicate table names was accepted")
	}
	if !strings.Contains(err.Error(), "Duplicate table names were found: wp_options") {
		t.Errorf("error =\n%s", err.Error())
	}
}

// --quiet suppresses the informational report but never the warnings, and
// never the fatal block.
func TestDevEnvSQLValidationQuietStillReportsProblems(t *testing.T) {
	var out bytes.Buffer
	if err := validateDevEnvSQL(sqlValidationInput{
		Path: cleanDump(t, "e.vipdev.site"), ExpectedDomain: "e.vipdev.site", Quiet: true,
	}, &out); err != nil {
		t.Fatal(err)
	}
	if out.Len() != 0 {
		t.Errorf("--quiet must print nothing for a clean dump, got:\n%s", out.String())
	}

	out.Reset()
	path := writeSQL(t, "DROP TABLE IF EXISTS `wp_options`;\nCREATE TABLE `wp_options` (`id` bigint NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`)) ENGINE=MyISAM;\n")
	if err := validateDevEnvSQL(sqlValidationInput{Path: path, ExpectedDomain: "e.vipdev.site", Quiet: true}, &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Warning: ENGINE != InnoDB") {
		t.Errorf("--quiet must still surface warnings, got:\n%s", out.String())
	}
}

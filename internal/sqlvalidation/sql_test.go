package sqlvalidation

import (
	"strings"
	"testing"
)

// findCheck returns the named check from the Result. Test helper.
func findCheck(t *testing.T, res *Result, key string) *Check {
	t.Helper()
	for _, c := range res.Checks {
		if c.Key == key {
			return c
		}
	}
	t.Fatalf("check %q not found", key)
	return nil
}

func TestValidateBinaryLogging(t *testing.T) {
	in := strings.NewReader("SET @@SESSION.sql_log_bin = 1;\n")
	res, err := Validate(in)
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	c := findCheck(t, res, "binaryLogging")
	if len(c.Results) != 1 || c.Results[0].Line != 1 {
		t.Errorf("binaryLogging: got %#v, want [{Line:1}]", c.Results)
	}
}

func TestValidateTrigger(t *testing.T) {
	in := strings.NewReader("CREATE DEFINER=`root`@`localhost` TRIGGER my_trigger BEFORE INSERT\n")
	res, _ := Validate(in)
	c := findCheck(t, res, "trigger")
	if len(c.Results) != 1 || c.Results[0].Line != 1 {
		t.Errorf("trigger: got %#v", c.Results)
	}
}

func TestValidateDropDatabase(t *testing.T) {
	in := strings.NewReader("DROP DATABASE foo;\n")
	res, _ := Validate(in)
	c := findCheck(t, res, "dropDB")
	if len(c.Results) != 1 || c.Results[0].Line != 1 {
		t.Errorf("dropDB: got %#v", c.Results)
	}
}

func TestValidateAlterUser(t *testing.T) {
	cases := []string{
		"ALTER USER 'root'@'localhost' IDENTIFIED BY 'x';\n",
		"SET PASSWORD FOR 'root'@'localhost' = 'x';\n",
	}
	for _, sql := range cases {
		res, _ := Validate(strings.NewReader(sql))
		c := findCheck(t, res, "alterUser")
		if len(c.Results) != 1 {
			t.Errorf("alterUser %q: got %d results", sql, len(c.Results))
		}
	}
}

func TestValidateDropTable(t *testing.T) {
	in := strings.NewReader("DROP TABLE IF EXISTS `wp_users`;\n")
	res, _ := Validate(in)
	c := findCheck(t, res, "dropTable")
	if len(c.Results) != 1 || c.Results[0].Text != "wp_users" {
		t.Errorf("dropTable: got %#v", c.Results)
	}
}

func TestValidateCreateTable(t *testing.T) {
	in := strings.NewReader("CREATE TABLE `wp_users` (id int);\n")
	res, _ := Validate(in)
	c := findCheck(t, res, "createTable")
	if len(c.Results) != 1 || c.Results[0].Text != "wp_users" {
		t.Errorf("createTable: got %#v", c.Results)
	}
	if len(res.TableNames) != 1 || res.TableNames[0] != "wp_users" {
		t.Errorf("tableNames: got %#v, want [wp_users]", res.TableNames)
	}
}

func TestValidateAlterTable(t *testing.T) {
	in := strings.NewReader("ALTER TABLE `wp_users` ADD COLUMN x INT;\n")
	res, _ := Validate(in)
	c := findCheck(t, res, "alterTable")
	if len(c.Results) != 1 || c.Results[0].Line != 1 {
		t.Errorf("alterTable: got %#v", c.Results)
	}
}

func TestValidateUniqueChecks(t *testing.T) {
	in := strings.NewReader("SET UNIQUE_CHECKS = 0;\n")
	res, _ := Validate(in)
	c := findCheck(t, res, "uniqueChecks")
	if len(c.Results) != 1 {
		t.Errorf("uniqueChecks: got %#v", c.Results)
	}
}

func TestValidateSiteHomeUrl(t *testing.T) {
	in := strings.NewReader(`INSERT INTO wp_options VALUES (1,'siteurl','http://example.com');` + "\n")
	res, _ := Validate(in)
	c := findCheck(t, res, "siteHomeUrl")
	if len(c.Results) != 1 || c.Results[0].Text != "siteurl http://example.com" {
		t.Errorf("siteHomeUrl: got %#v", c.Results)
	}
}

func TestValidateEngineInnoDB(t *testing.T) {
	// Non-InnoDB engine should be flagged.
	in := strings.NewReader(") ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;\n")
	res, _ := Validate(in)
	c := findCheck(t, res, "engineInnoDB")
	if len(c.Results) != 1 {
		t.Errorf("engineInnoDB MyISAM: got %d results, want 1", len(c.Results))
	}

	// InnoDB should NOT be flagged.
	in = strings.NewReader(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n")
	res, _ = Validate(in)
	c = findCheck(t, res, "engineInnoDB")
	if len(c.Results) != 0 {
		t.Errorf("engineInnoDB InnoDB: got %d results, want 0", len(c.Results))
	}

	// Case-insensitive ENGINE=, and an optional space before InnoDB are OK.
	in = strings.NewReader(") engine= InnoDB DEFAULT CHARSET=utf8mb4;\n")
	res, _ = Validate(in)
	c = findCheck(t, res, "engineInnoDB")
	if len(c.Results) != 0 {
		t.Errorf("engineInnoDB case-insensitive: got %d results, want 0", len(c.Results))
	}
}

func TestValidateAutoIncrement(t *testing.T) {
	in := strings.NewReader("  `id` bigint(20) NOT NULL AUTO_INCREMENT,\n")
	res, _ := Validate(in)
	c := findCheck(t, res, "autoIncrement")
	if len(c.Results) != 1 || c.Results[0].Text != "NOT NULL AUTO_INCREMENT," {
		t.Errorf("autoIncrement: got %#v", c.Results)
	}
}

func TestValidateMultiSiteDetection(t *testing.T) {
	in := strings.NewReader("CREATE TABLE wp_2_options (id int);\n")
	res, _ := Validate(in)
	if !res.IsMultiSite {
		t.Errorf("IsMultiSite: got false, want true")
	}
}

func TestValidateCleanDump(t *testing.T) {
	clean := strings.Join([]string{
		"-- A clean dump.",
		"DROP TABLE IF EXISTS `wp_options`;",
		"CREATE TABLE `wp_options` (",
		"  `option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,",
		"  PRIMARY KEY (`option_id`)",
		") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
		"INSERT INTO `wp_options` VALUES (1, 'siteurl', 'http://example.com');",
	}, "\n") + "\n"
	res, err := Validate(strings.NewReader(clean))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if res.IsMultiSite {
		t.Errorf("clean dump flagged multisite")
	}
	// dropTable and createTable present; everything else absent.
	if got := len(findCheck(t, res, "dropTable").Results); got != 1 {
		t.Errorf("dropTable: got %d, want 1", got)
	}
	if got := len(findCheck(t, res, "createTable").Results); got != 1 {
		t.Errorf("createTable: got %d, want 1", got)
	}
	for _, key := range []string{"binaryLogging", "trigger", "dropDB", "alterUser", "alterTable", "uniqueChecks", "engineInnoDB"} {
		if got := len(findCheck(t, res, key).Results); got != 0 {
			t.Errorf("%s in clean dump: got %d, want 0", key, got)
		}
	}
}

func TestValidateUseStatementSkipped(t *testing.T) {
	// useStatement is in DEV_ENV_SPECIFIC_CHECKS and never registered for
	// validate-sql; a USE statement should not appear in any check's results.
	in := strings.NewReader("USE my_database;\n")
	res, _ := Validate(in)
	for _, c := range res.Checks {
		if c.Key == "useStatement" {
			t.Fatalf("useStatement should not be registered for validate-sql")
		}
		if len(c.Results) != 0 {
			t.Errorf("%s flagged USE line: %#v", c.Key, c.Results)
		}
	}
}

func TestValidateFileMissing(t *testing.T) {
	_, err := ValidateFile("/nonexistent/path/that/should/not/exist.sql")
	if err == nil {
		t.Errorf("ValidateFile(missing): got nil, want error")
	}
}

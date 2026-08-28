package commands

import (
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/sqlvalidation"
)

func TestBuildImportValidationError(t *testing.T) {
	res, err := sqlvalidation.Validate(strings.NewReader(
		"DROP TABLE IF EXISTS `wp_posts`;\nCREATE TABLE `notwp_posts` (id INT) ENGINE=MyISAM;\n"))
	if err != nil {
		t.Fatal(err)
	}
	msg, problems := buildImportValidationError(res)
	if problems == 0 {
		t.Fatal("fixture must produce problems")
	}
	if !strings.Contains(msg, "SQL validation failed due to") {
		t.Errorf("msg = %q", msg)
	}
	// import mode: no wp_-prefix classifier (sql.ts:184), no "Finished
	// processing" header (sql.ts:412).
	if strings.Contains(msg, "wp_ prefix tables") || strings.Contains(msg, "without wp_ prefix") ||
		strings.Contains(msg, "Finished processing") {
		t.Errorf("import-mode report leaked validate-sql-only output: %q", msg)
	}
}

func TestBuildImportValidationErrorDuplicateTables(t *testing.T) {
	res, err := sqlvalidation.Validate(strings.NewReader(
		"CREATE TABLE `wp_posts` (id INT);\nCREATE TABLE `wp_posts` (id INT);\n"))
	if err != nil {
		t.Fatal(err)
	}
	msg, problems := buildImportValidationError(res)
	if problems == 0 || !strings.Contains(msg, "Duplicate table names were found: wp_posts") {
		t.Errorf("problems=%d msg=%q", problems, msg)
	}
}

func TestFormatCheckImportModeSkipsTablePrefixClassifier(t *testing.T) {
	res, err := sqlvalidation.Validate(strings.NewReader(
		"CREATE TABLE `notwp_posts` (id INT);\n"))
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range res.Checks {
		if c.Key != "createTable" {
			continue
		}
		errsImport, _, _, _ := formatCheck(c, true)
		errsStandalone, _, _, _ := formatCheck(c, false)
		joinedImport := strings.Join(errsImport, "\n")
		joinedStandalone := strings.Join(errsStandalone, "\n")
		if strings.Contains(joinedImport, "without wp_ prefix") {
			t.Errorf("import mode ran the prefix classifier: %q", joinedImport)
		}
		if !strings.Contains(joinedStandalone, "without wp_ prefix") {
			t.Errorf("standalone mode must run the prefix classifier: %q", joinedStandalone)
		}
		return
	}
	t.Fatal("createTable check not found")
}

package commands

import (
	"bytes"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/telemetry"
)

type recordingTelemetryClient struct {
	events []string
}

func (c *recordingTelemetryClient) TrackEvent(name string, _ map[string]any) error {
	c.events = append(c.events, name)
	return nil
}

// writeTempSQL writes content to a fresh tempfile and returns its path.
func writeTempSQL(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "dump.sql")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write temp sql: %v", err)
	}
	return path
}

// runValidateSQL executes the validate-sql leaf against a path and returns
// (stdout, returnedError). Tests assert on stdout content + nil error.
func runValidateSQL(t *testing.T, path string) (string, error) {
	t.Helper()
	cmd := ImportValidateSQLCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	err := runImportValidateSQL(cmd, []string{path})
	return stdout.String(), err
}

func TestImportValidateSQLClean(t *testing.T) {
	clean := strings.Join([]string{
		"-- A clean WP dump.",
		"DROP TABLE IF EXISTS `wp_options`;",
		"CREATE TABLE `wp_options` (",
		"  `option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,",
		"  PRIMARY KEY (`option_id`)",
		") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
	}, "\n") + "\n"
	path := writeTempSQL(t, clean)
	out, err := runValidateSQL(t, path)
	if err != nil {
		t.Fatalf("runImportValidateSQL: %v", err)
	}
	if strings.Contains(out, "SQL file looks clean") {
		t.Errorf("clean dump must stop after Node's per-check info block; got additive summary:\n%s", out)
	}
	// Required checks should report 1 hit each.
	if !strings.Contains(out, "CREATE TABLE was found 1 times.") {
		t.Errorf("expected CREATE TABLE info; got:\n%s", out)
	}
	if !strings.Contains(out, "DROP TABLE was found 1 times.") {
		t.Errorf("expected DROP TABLE info; got:\n%s", out)
	}
}

func TestImportValidateSQLDetectsMultiSite(t *testing.T) {
	// Minimal dump that satisfies all required checks (DROP TABLE,
	// CREATE TABLE, AUTO_INCREMENT, ENGINE=InnoDB) so multisite detection
	// is the ONLY behavior under test. No findings -> no exit-1 error.
	dump := strings.Join([]string{
		"DROP TABLE IF EXISTS `wp_2_options`;",
		"CREATE TABLE `wp_2_options` (",
		"  `option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,",
		"  PRIMARY KEY (`option_id`)",
		") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
	}, "\n") + "\n"
	path := writeTempSQL(t, dump)
	out, err := runValidateSQL(t, path)
	if err != nil {
		t.Fatalf("runImportValidateSQL: %v", err)
	}
	if !strings.Contains(out, "wp_n_ prefix tables found: 1") {
		t.Errorf("multisite dump output missing Node's prefix count; got:\n%s", out)
	}
	if strings.Contains(out, "Notice: this looks like a multi-site SQL dump") {
		t.Errorf("multisite dump must not add a message Node never emits; got:\n%s", out)
	}
}

func TestImportValidateSQLDropDatabase(t *testing.T) {
	dump := "DROP DATABASE foo;\n"
	path := writeTempSQL(t, dump)
	out, err := runValidateSQL(t, path)
	// Node parity: findings -> exit 1. Handler returns an error.
	if err == nil {
		t.Fatal("expected error return when DROP DATABASE finding is present")
	}
	if strings.Contains(out, "DROP DATABASE statement") {
		t.Errorf("failure findings belong in the returned error, not stdout; got:\n%s", out)
	}
	if !strings.Contains(err.Error(), "DROP DATABASE statement on line(s) 1.") {
		t.Errorf("returned error missing DROP DATABASE finding; got:\n%s", err)
	}
}

func TestImportValidateSQLFindingTracksFailureNotSuccess(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	client := &recordingTelemetryClient{}
	SetConfig(Config{Tracker: &telemetry.Tracker{Clients: []telemetry.Client{client}}})
	t.Cleanup(func() { SetConfig(Config{}) })

	path := writeTempSQL(t, "DROP DATABASE foo;\n")
	_, err := runValidateSQL(t, path)
	if err == nil {
		t.Fatal("expected SQL finding error")
	}

	events := strings.Join(client.events, ",")
	if !strings.Contains(events, "import_validate_sql_command_failure") {
		t.Fatalf("events = %q, want failure telemetry", events)
	}
	if strings.Contains(events, "import_validate_sql_command_success") {
		t.Fatalf("events = %q, must not report success for findings", events)
	}
}

func TestImportValidateSQLTrigger(t *testing.T) {
	dump := "CREATE DEFINER=`root`@`localhost` TRIGGER foo BEFORE INSERT\n"
	path := writeTempSQL(t, dump)
	out, err := runValidateSQL(t, path)
	if err == nil {
		t.Fatal("expected error return when TRIGGER finding is present")
	}
	if strings.Contains(out, "TRIGGER statement") {
		t.Errorf("failure findings belong in the returned error, not stdout; got:\n%s", out)
	}
	if !strings.Contains(err.Error(), "TRIGGER statement on line(s) 1.") {
		t.Errorf("returned error missing TRIGGER finding; got:\n%s", err)
	}
}

func TestImportValidateSQLAlterUser(t *testing.T) {
	dump := "ALTER USER 'root'@'localhost' IDENTIFIED BY 'x';\n"
	path := writeTempSQL(t, dump)
	out, err := runValidateSQL(t, path)
	if err == nil {
		t.Fatal("expected error return when ALTER USER finding is present")
	}
	if strings.Contains(out, "ALTER USER statement") {
		t.Errorf("failure findings belong in the returned error, not stdout; got:\n%s", out)
	}
	if !strings.Contains(err.Error(), "ALTER USER statement on line(s) 1.") {
		t.Errorf("returned error missing ALTER USER finding; got:\n%s", err)
	}
}

func TestImportValidateSQLBinaryLogging(t *testing.T) {
	dump := "SET @@SESSION.sql_log_bin=0;\n"
	path := writeTempSQL(t, dump)
	out, err := runValidateSQL(t, path)
	if err == nil {
		t.Fatal("expected error return when sql_log_bin finding is present")
	}
	if strings.Contains(out, "SET @@SESSION.sql_log_bin statement") {
		t.Errorf("failure findings belong in the returned error, not stdout; got:\n%s", out)
	}
	if !strings.Contains(err.Error(), "SET @@SESSION.sql_log_bin statement on line(s) 1.") {
		t.Errorf("returned error missing sql_log_bin finding; got:\n%s", err)
	}
}

func TestImportValidateSQLMissingFile(t *testing.T) {
	cmd := ImportValidateSQLCmd()
	cmd.SetOut(&bytes.Buffer{})
	cmd.SetErr(&bytes.Buffer{})
	err := runImportValidateSQL(cmd, []string{"/nonexistent/path/file.sql"})
	if err == nil {
		t.Fatal("expected error for missing file")
	}
	if !strings.Contains(err.Error(), "missing or not readable") {
		t.Errorf("error wording: got %q, want Node-parity 'missing or not readable'", err.Error())
	}
}

// writeTempBytes writes raw bytes under an arbitrary basename so the test
// can decouple the file's NAME from its CONTENT.
func writeTempBytes(t *testing.T, name string, content []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	return path
}

// gzipBytes returns a real gzip stream (starts with the 1f8b magic number).
func gzipBytes(t *testing.T, payload string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	if _, err := zw.Write([]byte(payload)); err != nil {
		t.Fatalf("gzip write: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}
	return buf.Bytes()
}

func TestImportValidateSQLCompressedRejected(t *testing.T) {
	path := writeTempBytes(t, "dump.sql.gz", gzipBytes(t, "SELECT 1;\n"))
	cmd := ImportValidateSQLCmd()
	cmd.SetOut(&bytes.Buffer{})
	cmd.SetErr(&bytes.Buffer{})
	err := runImportValidateSQL(cmd, []string{path})
	if err == nil {
		t.Fatal("expected error for gzip file")
	}
	if !strings.Contains(err.Error(), "Compressed files cannot be validated") {
		t.Errorf("compressed-file error wording: got %q", err.Error())
	}
}

// Node's getFileMeta calls detectCompressedMimeType (client-file-uploader.ts:458),
// which reads the first 4 bytes and compares them against 504b0304 / 1f8b.
// The file EXTENSION is never consulted. Extension-sniffing is wrong in both
// directions; this is the "gzipped file that isn't named .gz" direction —
// feeding raw gzip bytes to the line validator produces garbage findings
// instead of the actionable "extract the archive" message.
func TestDetectCompressedGzipContentRegardlessOfExtension(t *testing.T) {
	path := writeTempBytes(t, "dump.sql", gzipBytes(t, "CREATE TABLE `wp_x` (id int);\n"))
	if !fileMetaIsCompressed(path) {
		t.Error("gzip content under a .sql name reported as uncompressed (extension sniffing)")
	}
}

func TestDetectCompressedZipContentRegardlessOfExtension(t *testing.T) {
	// PK\x03\x04 — the local file header magic Node checks for.
	path := writeTempBytes(t, "dump.sql", []byte("PK\x03\x04rest-of-archive"))
	if !fileMetaIsCompressed(path) {
		t.Error("zip content under a .sql name reported as uncompressed")
	}
}

// ...and the other direction: a plain SQL file that merely happens to be
// NAMED .gz must be validated, not rejected. Extension sniffing refused to
// validate it at all.
func TestDetectCompressedPlainSQLNamedGzIsNotCompressed(t *testing.T) {
	path := writeTempBytes(t, "dump.sql.gz", []byte("CREATE TABLE `wp_x` (id int);\n"))
	if fileMetaIsCompressed(path) {
		t.Error("plain SQL named .gz reported as compressed (extension sniffing)")
	}
}

// A file shorter than the 4-byte probe must not be misread. Node allocates a
// 4-byte zero-filled buffer, so a 1-byte 0x1f file hexes to "1f000000" and
// does NOT match 1f8b.
func TestDetectCompressedShortFileIsNotCompressed(t *testing.T) {
	path := writeTempBytes(t, "tiny.sql", []byte{0x1f})
	if fileMetaIsCompressed(path) {
		t.Error("1-byte 0x1f file misdetected as gzip")
	}
	empty := writeTempBytes(t, "empty.sql", nil)
	if fileMetaIsCompressed(empty) {
		t.Error("empty file misdetected as compressed")
	}
}

func TestImportValidateSQLDuplicateTables(t *testing.T) {
	dump := strings.Join([]string{
		"CREATE TABLE `wp_users` (id int);",
		"CREATE TABLE `wp_users` (id int);",
	}, "\n") + "\n"
	path := writeTempSQL(t, dump)
	out, err := runValidateSQL(t, path)
	if err == nil {
		t.Fatal("expected error return when duplicate-table finding is present")
	}
	if strings.Contains(out, "Duplicate table names were found: wp_users") {
		t.Errorf("failure findings belong in the returned error, not stdout; got:\n%s", out)
	}
	if !strings.Contains(err.Error(), "Duplicate table names were found: wp_users") {
		t.Errorf("returned error missing duplicate-table finding; got:\n%s", err)
	}
}

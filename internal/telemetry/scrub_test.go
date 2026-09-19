package telemetry

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestScrubErrorTextRemovesTheHomeDirectory is the finding that motivated this
// function: the cli_error hook ships err.Error() verbatim to
// public-api.wordpress.com, and vip-next errors interpolate absolute paths
// constantly (import sql, import media, dev-env, every os.Open failure). The
// home directory contains the user's account name, which is PII on its own and
// frequently their real name.
func TestScrubErrorTextRemovesTheHomeDirectory(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skipf("no home directory available: %v", err)
	}
	path := filepath.Join(home, "clients", "acme-corp", "db-dump.sql")

	got := ScrubErrorText("open " + path + ": permission denied")

	if strings.Contains(got, home) {
		t.Errorf("home directory survived:\n\t%s", got)
	}
	if !strings.Contains(got, "permission denied") {
		t.Errorf("the actual failure was lost:\n\t%s", got)
	}
}

// TestScrubErrorTextRemovesTheWorkingDirectory pins the ordering. The working
// directory is usually INSIDE the home directory, so a scrubber that replaced
// home first would emit "$HOME/clients/acme-corp/...", still naming the client.
// Longest prefix must win.
func TestScrubErrorTextRemovesTheWorkingDirectory(t *testing.T) {
	cwd, err := os.Getwd()
	if err != nil {
		t.Skipf("no working directory available: %v", err)
	}

	got := ScrubErrorText("could not read " + filepath.Join(cwd, "wp-config.php"))

	if strings.Contains(got, cwd) {
		t.Errorf("working directory survived:\n\t%s", got)
	}
	if !strings.Contains(got, "wp-config.php") {
		t.Errorf("the filename was lost; it is the diagnostic part:\n\t%s", got)
	}
}

func TestScrubErrorTextRemovesTheTempDirectory(t *testing.T) {
	tmp := os.TempDir()

	got := ScrubErrorText("staging file " + filepath.Join(tmp, "vip-import-9271", "chunk.0") + " vanished")

	if strings.Contains(got, tmp) {
		t.Errorf("temp directory survived:\n\t%s", got)
	}
}

// TestScrubErrorTextRemovesForeignHomePaths is the safety net. Not every
// absolute path in an error came from THIS process's home: paths are read out
// of config files, instance data, SQL dumps and server responses. The username
// is the sensitive part, so it goes regardless of which root it hangs off.
func TestScrubErrorTextRemovesForeignHomePaths(t *testing.T) {
	cases := []string{
		"/Users/jsmith/Sites/client/wp-content",
		"/home/jsmith/sites/client/wp-content",
	}
	if runtime.GOOS == "windows" {
		cases = append(cases, `C:\Users\jsmith\Sites\client`)
	}
	for _, path := range cases {
		got := ScrubErrorText("no such file: " + path)
		if strings.Contains(got, "jsmith") {
			t.Errorf("username survived in %q:\n\t%s", path, got)
		}
		if !strings.Contains(got, "no such file") {
			t.Errorf("message body lost for %q:\n\t%s", path, got)
		}
	}
}

// TestScrubErrorTextAlsoRemovesCredentials confirms the path scrubbing is
// layered on top of internal/redact rather than replacing it. An earlier slice
// found proxy errors carrying socks5://user:pass@host into this exact hook and
// redacted them at the source; this is the second line of defence, for the
// sources nobody has audited yet.
func TestScrubErrorTextAlsoRemovesCredentials(t *testing.T) {
	got := ScrubErrorText(`Get "https://vip.s3.amazonaws.com/export.sql?X-Amz-Signature=abc123def456": timeout`)
	if strings.Contains(got, "X-Amz-Signature") || strings.Contains(got, "abc123def456") {
		t.Errorf("presigned credential survived:\n\t%s", got)
	}

	got = ScrubErrorText("proxy socks5://alice:hunter2@corp.example:1080 refused")
	if strings.Contains(got, "hunter2") {
		t.Errorf("proxy password survived:\n\t%s", got)
	}
}

// TestScrubErrorTextKeepsOrdinaryMessagesIntact is the counterweight: the whole
// point of scrubbing rather than dropping the hook is that the payload stays
// useful. If this test starts failing, the scrubber has become too aggressive
// and removing the hook (Node has none) is the better trade.
func TestScrubErrorTextKeepsOrdinaryMessagesIntact(t *testing.T) {
	for _, msg := range []string{
		"appctx: GraphQL client not configured",
		"environment my-site is not running; run `vip dev-env start`",
		"failed to reach public-api.wordpress.com: connection refused",
		"import sql: file is not a valid SQL export",
	} {
		if got := ScrubErrorText(msg); got != msg {
			t.Errorf("scrubber rewrote a message with nothing sensitive in it:\n\tin:  %s\n\tout: %s", msg, got)
		}
	}
}

func TestScrubErrorTextIsIdempotent(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skipf("no home directory available: %v", err)
	}
	in := "open " + filepath.Join(home, "a", "b.sql") + ": denied"
	once := ScrubErrorText(in)
	if twice := ScrubErrorText(once); twice != once {
		t.Errorf("not idempotent:\n\t1x: %s\n\t2x: %s", once, twice)
	}
}

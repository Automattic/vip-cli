package devenv

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/appctx"
)

// Parity blocker B2. Node's dev-env import sql reaches searchAndReplace through
// resolveImportPath (dev-environment-core.ts:854) WITHOUT batchMode, so the
// "This operation is not reversible" confirm fires — unlike the platform
// `vip import sql` path, which passes batchMode:true (vip-import-sql.js:732)
// because it has already confirmed. vip-next rewrote the user's dump with no
// prompt on either dev-env path.
//
// The test process has no TTY, so the gate must refuse before anything is
// rewritten — and before Docker is contacted, which is also why this test can
// run without a container.
func TestImportSQLInPlaceRequiresConfirmation(t *testing.T) {
	src := filepath.Join(t.TempDir(), "dump.sql")
	const original = "-- MySQL dump\nCREATE TABLE a;\n"
	if err := os.WriteFile(src, []byte(original), 0o644); err != nil { // #nosec G306
		t.Fatal(err)
	}

	err := ImportSQL(context.Background(), "e", src, ImportOptions{
		SearchReplace: []string{"from,to"},
		InPlace:       true,
	})
	if !errors.Is(err, appctx.ErrNonInteractive) {
		t.Errorf("err = %v; want appctx.ErrNonInteractive (the in-place confirm must gate the rewrite)", err)
	}
	got, readErr := os.ReadFile(src) // #nosec G304
	if readErr != nil {
		t.Fatal(readErr)
	}
	if string(got) != original {
		t.Errorf("dump was rewritten without confirmation:\n got %q\nwant %q", got, original)
	}
}

// BatchMode is Node's own pre-confirm (search-and-replace.ts:151 gates on
// `inPlace && ! batchMode`). `dev-env sync sql` sets it because the file is a
// temp export, not anything the user named — Node never even reaches this
// prompt from sync, since runImport passes no searchReplace at all
// (dev-env-sync-sql.ts:333-338).
//
// Without this, sync asks a meaningless question interactively and in CI fails
// with ErrNonInteractive *after* the whole production export has been paid for.
func TestImportSQLBatchModeSkipsInPlaceConfirmation(t *testing.T) {
	src := filepath.Join(t.TempDir(), "dump.sql")
	if err := os.WriteFile(src, []byte("-- MySQL dump\nCREATE TABLE a;\n"), 0o644); err != nil { // #nosec G306
		t.Fatal(err)
	}

	err := ImportSQL(context.Background(), "e", src, ImportOptions{
		SearchReplace: []string{"from,to"},
		InPlace:       true,
		SkipValidate:  true,
		BatchMode:     true,
		Confirm: func(string, bool) (bool, error) {
			t.Error("BatchMode must pre-confirm; the prompt fired anyway")
			return false, nil
		},
	})
	// It must get PAST the confirm. It then fails for an unrelated reason
	// (no Docker in a unit test), which is the point: not ErrNonInteractive.
	if errors.Is(err, appctx.ErrNonInteractive) {
		t.Errorf("err = %v; BatchMode must not reach the interactive gate", err)
	}
}

// Without --in-place nothing irreversible happens, so there must be no prompt:
// the run proceeds (and then fails for an unrelated, non-confirmation reason).
func TestImportSQLWithoutInPlaceDoesNotConfirm(t *testing.T) {
	src := filepath.Join(t.TempDir(), "dump.sql")
	if err := os.WriteFile(src, []byte("-- MySQL dump\nCREATE TABLE a;\n"), 0o644); err != nil { // #nosec G306
		t.Fatal(err)
	}
	err := ImportSQL(context.Background(), "e", src, ImportOptions{SearchReplace: []string{"from,to"}})
	if errors.Is(err, appctx.ErrNonInteractive) {
		t.Error("no --in-place: Node does not prompt here, so vip-next must not either")
	}
}

func TestImportSQLArgs(t *testing.T) {
	// --allow-root: the php container runs as root, so wp-cli refuses without it.
	got := importSQLArgs("/tmp/in/file.sql")
	want := []string{"exec", "-T", "php", "wp", "--allow-root", "db", "import", "/tmp/in/file.sql"}
	assertArgv(t, got, want)
}

func TestMyDumperImportArgs(t *testing.T) {
	// db-myloader is a Lando tooling alias for the myloader binary (run in the
	// php service), NOT a wp-cli command.
	got := myDumperImportArgs("wordpress", false, 4)
	want := []string{
		"exec", "-T", "php",
		"myloader", "-h", "database", "-u", "wordpress", "-p", "wordpress", "--database", "wordpress",
		"--drop-table", "--source-db=wordpress", "--threads=4",
		"--max-threads-for-schema-creation=10", "--max-threads-for-index-creation=10",
		"--skip-triggers", "--skip-post", "--optimize-keys", "--checksum=SKIP",
		"--metadata-refresh-interval=2000000", "--stream", "--verbose=3",
	}
	assertArgv(t, got, want)
}

func TestMyDumperImportArgsNoSourceDBQuiet(t *testing.T) {
	got := myDumperImportArgs("", true, 1)
	joined := strings.Join(got, " ")
	if strings.Contains(joined, "--source-db") {
		t.Fatalf("empty source db must omit --source-db: %v", got)
	}
	if !strings.Contains(joined, "--threads=1") || !strings.Contains(joined, "--verbose=0") {
		t.Fatalf("quiet/threads not applied: %v", got)
	}
}

func TestImportSQLCopyArgs(t *testing.T) {
	got := importCopyArgs("/host/file.sql", "containerid", "/tmp/file.sql")
	want := []string{"cp", "/host/file.sql", "containerid:/tmp/file.sql"}
	assertArgv(t, got, want)
}

func TestImportMediaCopyArgs(t *testing.T) {
	// Trailing /. copies the directory CONTENTS into uploads (not a nested dir).
	got := importMediaCopyArgs("/host/uploads", "cid")
	want := []string{"cp", "/host/uploads/.", "cid:/wp/wp-content/uploads"}
	assertArgv(t, got, want)
}

func TestSearchReplacePairsFromFlag(t *testing.T) {
	got := searchReplacePairs([]string{"old.com,new.test", "a,b"})
	if len(got) != 2 || got[0] != "old.com,new.test" {
		t.Fatalf("pairs = %v", got)
	}
}

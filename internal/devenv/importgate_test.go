package devenv

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/dockercli"
)

// seedImportEnv writes instance data with no domain, so instancedata.Read
// backfills LegacyDomain — the environment therefore serves this host.
const testEnvDomain = "e.vipdev.lndo.site"

// validDump is a dump that satisfies every FATAL check for env "e".
func validDump(t *testing.T) string {
	t.Helper()
	return writeSQL(t, strings.Join([]string{
		"-- MySQL dump 10.13",
		"DROP TABLE IF EXISTS `wp_options`;",
		"CREATE TABLE `wp_options` (",
		"  `option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,",
		"  PRIMARY KEY (`option_id`)",
		") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
		"INSERT INTO `wp_options` VALUES (1,'siteurl','https://" + testEnvDomain + "');",
	}, "\n")+"\n")
}

// A dump Node rejects (DROP DATABASE) must not reach the database, and must
// not reach Docker at all. Before this, vip-next ran no SQL validation on the
// dev-env path whatsoever and imported it with exit 0.
func TestImportSQLBlocksDumpNodeRejects(t *testing.T) {
	seedImportEnv(t)
	body, err := os.ReadFile(validDump(t)) // #nosec G304
	if err != nil {
		t.Fatal(err)
	}
	path := writeSQL(t, "DROP DATABASE wordpress;\n"+string(body))

	f := &fakeImportRunner{}
	importErr := importSQL(context.Background(), f, "e", path, ImportOptions{Out: io.Discard})
	if importErr == nil {
		t.Fatal("a dump containing DROP DATABASE was imported")
	}
	if !strings.Contains(importErr.Error(), "DROP DATABASE statement on line(s) 1.") {
		t.Errorf("unexpected error: %v", importErr)
	}
	if len(f.calls) != 0 || len(f.docker) != 0 || len(f.stdin) != 0 {
		t.Errorf("validation must fail before anything is executed; ran compose=%v docker=%v", f.joined(), f.docker)
	}
}

// --skip-validate is the escape hatch and must genuinely skip the checks.
func TestImportSQLSkipValidateImportsRejectedDump(t *testing.T) {
	seedImportEnv(t)
	path := writeSQL(t, "DROP DATABASE wordpress;\nUSE other;\n")

	f := &fakeImportRunner{}
	if err := importSQL(context.Background(), f, "e", path, ImportOptions{SkipValidate: true, Out: io.Discard}); err != nil {
		t.Fatalf("--skip-validate must skip validation, got: %v", err)
	}
	if !strings.Contains(strings.Join(f.joined(), "\n"), "db import") {
		t.Errorf("the import did not run: %v", f.joined())
	}
}

// Node gates on isContainerRunning(php) && isContainerRunning(database)
// (dev-env-import-sql.ts:84-93) with this exact message. vip-next used to fail
// deep inside `docker compose ps -q php` with an opaque error instead.
func TestImportSQLRequiresRunningEnvironment(t *testing.T) {
	for _, tc := range []struct {
		name   string
		states []dockercli.ServiceState
	}{
		{"php stopped", []dockercli.ServiceState{{Service: "php", State: "exited"}, {Service: "database", State: "running"}}},
		{"database stopped", []dockercli.ServiceState{{Service: "php", State: "running"}, {Service: "database", State: "exited"}}},
		{"nothing created", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			seedImportEnv(t)
			f := &fakeImportRunner{psStates: tc.states, psSet: true}
			err := importSQL(context.Background(), f, "e", validDump(t), ImportOptions{Out: io.Discard})
			if err == nil || err.Error() != "Environment needs to be started first" {
				t.Fatalf("err = %v, want Node's exact UserError message", err)
			}
			if len(f.calls) != 0 || len(f.docker) != 0 {
				t.Errorf("nothing may run against a stopped environment; ran %v %v", f.joined(), f.docker)
			}
		})
	}
}

// One flag skips both, exactly as Node has it: the gate and the checks live
// inside the same `if ( ! this.options.skipValidate )`.
func TestImportSQLSkipValidateSkipsRunningEnvironmentGate(t *testing.T) {
	seedImportEnv(t)
	f := &fakeImportRunner{psStates: nil, psSet: true}
	if err := importSQL(context.Background(), f, "e", validDump(t), ImportOptions{SkipValidate: true, Out: io.Discard}); err != nil {
		t.Fatalf("--skip-validate must skip the running-environment gate too, got: %v", err)
	}
}

// Node validates `resolvedPath` — the file AFTER search-replace
// (dev-env-import-sql.ts:76-96) — so `--search-replace` is what makes a
// production dump importable. Validating the ORIGINAL would reject it.
func TestImportSQLValidatesTheSearchReplacedFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake search-replace binary is POSIX-only")
	}
	seedImportEnv(t)
	bin := filepath.Join(t.TempDir(), "go-search-replace")
	script := "#!/bin/sh\nsed 's|example\\.com|" + testEnvDomain + "|g'\n"
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil { // #nosec G306
		t.Fatal(err)
	}
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)

	path := writeSQL(t, strings.Join([]string{
		"-- MySQL dump 10.13",
		"DROP TABLE IF EXISTS `wp_options`;",
		"CREATE TABLE `wp_options` (`option_id` bigint(20) NOT NULL AUTO_INCREMENT, PRIMARY KEY (`option_id`)) ENGINE=InnoDB;",
		"INSERT INTO `wp_options` VALUES (1,'siteurl','https://example.com');",
	}, "\n")+"\n")

	// Without pairs the production URL survives and the import is blocked.
	f := &fakeImportRunner{}
	if err := importSQL(context.Background(), f, "e", path, ImportOptions{Out: io.Discard}); err == nil {
		t.Fatal("a production siteurl with no --search-replace must be blocked")
	}

	// With pairs the validated file is the rewritten one, so it imports.
	seedImportEnv(t)
	f = &fakeImportRunner{}
	if err := importSQL(context.Background(), f, "e", path, ImportOptions{
		SearchReplace: []string{"example.com," + testEnvDomain},
		Out:           io.Discard,
	}); err != nil {
		t.Fatalf("--search-replace must make the dump valid, got: %v", err)
	}
	if !strings.Contains(strings.Join(f.joined(), "\n"), "db import") {
		t.Errorf("the import did not run: %v", f.joined())
	}
}

// Deliberate ordering divergence: the running-environment gate runs BEFORE the
// search-replace, so a stopped environment cannot leave a half-rewritten dump
// (Node resolves the import path first and rewrites --in-place regardless).
func TestImportSQLGateRunsBeforeSearchReplace(t *testing.T) {
	seedImportEnv(t)
	// A binary that cannot exist: if search-replace ran, the error would be an
	// exec failure rather than the gate message.
	t.Setenv("VIP_SEARCH_REPLACE_BIN", filepath.Join(t.TempDir(), "definitely-not-here"))

	f := &fakeImportRunner{psStates: nil, psSet: true}
	err := importSQL(context.Background(), f, "e", validDump(t), ImportOptions{
		SearchReplace: []string{"a,b"},
		Out:           io.Discard,
	})
	if err == nil || err.Error() != "Environment needs to be started first" {
		t.Fatalf("err = %v, want the gate to fire before any file rewrite", err)
	}
}

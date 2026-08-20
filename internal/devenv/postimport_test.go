package devenv

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/devenv/instancedata"
)

// fakeExecer records every compose invocation and can fail a chosen wp
// subcommand, so the post-import sequence is testable with no Docker.
type fakeExecer struct {
	calls [][]string
	// failOn fails any call whose joined argv contains this substring.
	failOn string
}

func (f *fakeExecer) Compose(_ context.Context, _ string, args ...string) error {
	f.calls = append(f.calls, args)
	if f.failOn != "" && strings.Contains(strings.Join(args, " "), f.failOn) {
		return errors.New("boom")
	}
	return nil
}

func (f *fakeExecer) joined() []string {
	out := make([]string, len(f.calls))
	for i, c := range f.calls {
		out[i] = strings.Join(c, " ")
	}
	return out
}

// Register 2.20. Node's DevEnvImportSQLCommand.run() does NOT stop at the
// `wp db import`: it flushes the object cache, reindexes Elasticsearch,
// (re)creates the `vipgo` admin user and runs the VIP data cleanup
// (src/commands/dev-env-import-sql.ts:128-142). vip-next skipped all of it,
// which is why a user is locked out of their own local wp-admin after an
// import. This pins the steps, their order and their exact argv.
func TestPostImportStepsRunsNodeSequence(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("e", &instancedata.InstanceData{
		SiteSlug: "e", Multisite: []byte("false"), AdminPassword: "seededpass1",
	}); err != nil {
		t.Fatal(err)
	}

	f := &fakeExecer{}
	if err := postImportSteps(context.Background(), f, "e", postImportOptions{}, &bytes.Buffer{}); err != nil {
		t.Fatalf("postImportSteps: %v", err)
	}

	want := []string{
		"exec -T php wp --allow-root cache flush --skip-plugins --skip-themes",
		"exec -T php wp --allow-root cli has-command vip-search",
		"exec -T php wp --allow-root vip-search index --setup --network-wide --skip-confirm",
		"exec -T php wp --allow-root dev-env-add-admin --username=vipgo --password=seededpass1 --skip-plugins --skip-themes",
		"exec -T php wp --allow-root vip data-cleanup sql-import",
	}
	got := f.joined()
	if len(got) != len(want) {
		t.Fatalf("post-import ran %d steps, want %d:\n got %v\nwant %v", len(got), len(want), got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("step %d =\n %q\nwant %q", i, got[i], want[i])
		}
	}
}

// Node appends --quiet to flushCache, addAdminUser and dataCleanup from the
// `quiet` argument — except that import-sql calls addAdminUser WITHOUT it
// (dev-env-import-sql.ts:141 passes only lando+slug), so the admin step is
// never quiet. Node's own inconsistency; matched deliberately.
func TestPostImportStepsQuietMatchesNodeArgumentPassing(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("e", &instancedata.InstanceData{
		SiteSlug: "e", Multisite: []byte("false"), AdminPassword: "seededpass1",
	}); err != nil {
		t.Fatal(err)
	}

	f := &fakeExecer{}
	if err := postImportSteps(context.Background(), f, "e", postImportOptions{Quiet: true}, &bytes.Buffer{}); err != nil {
		t.Fatalf("postImportSteps: %v", err)
	}
	got := f.joined()
	want := []string{
		"exec -T php wp --allow-root cache flush --skip-plugins --skip-themes --quiet",
		"exec -T php wp --allow-root cli has-command vip-search",
		"exec -T php wp --allow-root vip-search index --setup --network-wide --skip-confirm",
		"exec -T php wp --allow-root dev-env-add-admin --username=vipgo --password=seededpass1 --skip-plugins --skip-themes",
		"exec -T php wp --allow-root vip data-cleanup sql-import --quiet",
	}
	for i := range want {
		if i >= len(got) || got[i] != want[i] {
			t.Errorf("quiet step %d = %q, want %q", i, safeIdx(got, i), want[i])
		}
	}
}

func safeIdx(s []string, i int) string {
	if i < len(s) {
		return s[i]
	}
	return "<missing>"
}

// fakeImportRunner is a full stand-in for dockercli.Runner covering everything
// the import path touches, so the whole ImportSQL sequence runs with no Docker.
type fakeImportRunner struct {
	fakeExecer
	docker  [][]string
	stdin   [][]string
	failOnD string
	// psStates is what ComposePS returns once psSet is true (psSet exists so a
	// test can assert on an EMPTY service list — a never-started environment).
	// Unset means php + database running, the normal case.
	psStates []dockercli.ServiceState
	psSet    bool
	psErr    error
}

func (f *fakeImportRunner) ComposePS(_ context.Context, _ string) ([]dockercli.ServiceState, error) {
	if f.psErr != nil {
		return nil, f.psErr
	}
	if f.psSet {
		return f.psStates, nil
	}
	return []dockercli.ServiceState{
		{Service: "php", State: "running"},
		{Service: "database", State: "running"},
	}, nil
}

func (f *fakeImportRunner) Docker(_ context.Context, args ...string) error {
	f.docker = append(f.docker, args)
	if f.failOnD != "" && strings.Contains(strings.Join(args, " "), f.failOnD) {
		return errors.New("boom")
	}
	return nil
}

func (f *fakeImportRunner) ComposeStdin(_ context.Context, _ string, _ io.Reader, args ...string) error {
	f.stdin = append(f.stdin, args)
	return nil
}

func (f *fakeImportRunner) ComposeOut(_ context.Context, _ string, args ...string) ([]byte, error) {
	if len(args) > 0 && args[0] == "ps" {
		return []byte("containerid123\n"), nil
	}
	return nil, nil
}

func seedImportEnv(t *testing.T) {
	t.Helper()
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("e", &instancedata.InstanceData{
		SiteSlug: "e", Multisite: []byte("false"), AdminPassword: "seededpass1",
	}); err != nil {
		t.Fatal(err)
	}
}

// writeDump produces a dump that passes the dev-env SQL validation (which now
// runs on this path): DROP TABLE + CREATE TABLE + AUTO_INCREMENT present, a
// wp_ prefix, InnoDB, and no siteurl pointing away from the environment.
func writeDump(t *testing.T) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "dump.sql")
	body := strings.Join([]string{
		"-- MySQL dump 10.13",
		"DROP TABLE IF EXISTS `wp_options`;",
		"CREATE TABLE `wp_options` (",
		"  `option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,",
		"  PRIMARY KEY (`option_id`)",
		") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
	}, "\n") + "\n"
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

// Register 2.20 (wiring): the post-import steps must actually run at the end of
// `dev-env import sql`, not merely exist. Before this fix the import stopped at
// `wp db import` and the user was locked out of their local wp-admin.
func TestImportSQLRunsPostImportSteps(t *testing.T) {
	seedImportEnv(t)
	f := &fakeImportRunner{}
	if err := importSQL(context.Background(), f, "e", writeDump(t), ImportOptions{}); err != nil {
		t.Fatalf("importSQL: %v", err)
	}
	all := strings.Join(f.joined(), "\n")
	for _, want := range []string{
		"wp --allow-root db import",
		"cache flush",
		"dev-env-add-admin --username=vipgo",
		"vip data-cleanup sql-import",
	} {
		if !strings.Contains(all, want) {
			t.Errorf("import sql did not run %q; ran:\n%s", want, all)
		}
	}
	// Order: the import itself must come first.
	if i, j := strings.Index(all, "db import"), strings.Index(all, "cache flush"); i < 0 || j < 0 || i > j {
		t.Errorf("post-import steps must follow the import, got:\n%s", all)
	}
}

// The MyDumper path shares Node's run(), so it gets the same post-import steps.
// vip-next's importMyDumperDump returned early, skipping all of them.
func TestImportSQLMyDumperRunsPostImportSteps(t *testing.T) {
	seedImportEnv(t)
	p := filepath.Join(t.TempDir(), "dump.sql")
	// A MyDumper stream skips dropTable/dropDB but still has to satisfy the
	// createTable / autoIncrement required checks.
	body := "-- metadata.header 1\n-- mydb-schema-create.sql 0\n" +
		"CREATE TABLE `wp_options` (`option_id` bigint(20) NOT NULL AUTO_INCREMENT, PRIMARY KEY (`option_id`)) ENGINE=InnoDB;\n"
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	f := &fakeImportRunner{}
	if err := importSQL(context.Background(), f, "e", p, ImportOptions{}); err != nil {
		t.Fatalf("importSQL: %v", err)
	}
	if len(f.stdin) == 0 {
		t.Fatal("expected the myloader stream path to be taken")
	}
	if !strings.Contains(strings.Join(f.joined(), "\n"), "dev-env-add-admin --username=vipgo") {
		t.Errorf("MyDumper import skipped the vipgo admin user; ran:\n%v", f.joined())
	}
}

// Node prints "Success: Database imported." after the import unless --quiet
// (dev-env-import-sql.ts:117). vip-next printed nothing at all.
func TestImportSQLPrintsSuccessUnlessQuiet(t *testing.T) {
	seedImportEnv(t)
	var out bytes.Buffer
	f := &fakeImportRunner{}
	if err := importSQL(context.Background(), f, "e", writeDump(t), ImportOptions{Out: &out}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Database imported.") {
		t.Errorf("missing Node's success line, got %q", out.String())
	}

	seedImportEnv(t)
	out.Reset()
	if err := importSQL(context.Background(), &fakeImportRunner{}, "e", writeDump(t), ImportOptions{Quiet: true, Out: &out}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "Database imported.") {
		t.Errorf("--quiet must suppress the success line, got %q", out.String())
	}
}

// --skip-reindex must actually skip the Elasticsearch reindex (Node:
// dev-env-import-sql.ts:130). It was a documented no-op in vip-next.
func TestPostImportStepsSkipReindex(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("e", &instancedata.InstanceData{
		SiteSlug: "e", Multisite: []byte("false"), AdminPassword: "seededpass1",
	}); err != nil {
		t.Fatal(err)
	}
	f := &fakeExecer{}
	if err := postImportSteps(context.Background(), f, "e", postImportOptions{SkipReindex: true}, &bytes.Buffer{}); err != nil {
		t.Fatalf("postImportSteps: %v", err)
	}
	for _, c := range f.joined() {
		if strings.Contains(c, "vip-search") {
			t.Errorf("--skip-reindex still ran the reindex: %q", c)
		}
	}
	// The admin user must still be created.
	if !strings.Contains(strings.Join(f.joined(), "\n"), "dev-env-add-admin") {
		t.Error("--skip-reindex must not skip the vipgo admin user")
	}
}

// Node wraps reIndexSearch in try/catch with the comment "Exception means they
// don't have vip-search enabled" — a missing vip-search must NOT fail the
// import, and must not stop the admin user from being created.
func TestPostImportStepsReindexFailureIsNotFatal(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("e", &instancedata.InstanceData{
		SiteSlug: "e", Multisite: []byte("false"), AdminPassword: "seededpass1",
	}); err != nil {
		t.Fatal(err)
	}
	f := &fakeExecer{failOn: "vip-search"}
	if err := postImportSteps(context.Background(), f, "e", postImportOptions{}, &bytes.Buffer{}); err != nil {
		t.Fatalf("a missing vip-search must not fail the import, got %v", err)
	}
	if !strings.Contains(strings.Join(f.joined(), "\n"), "dev-env-add-admin") {
		t.Error("the admin user must still be created after a reindex failure")
	}
}

// Node's dataCleanup catches its own error and prints "WARNING: data cleanup
// failed." (dev-environment-database.ts:53-57) — it must not fail the import.
func TestPostImportStepsDataCleanupFailureWarnsAndContinues(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("e", &instancedata.InstanceData{
		SiteSlug: "e", Multisite: []byte("false"), AdminPassword: "seededpass1",
	}); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	f := &fakeExecer{failOn: "data-cleanup"}
	if err := postImportSteps(context.Background(), f, "e", postImportOptions{}, &out); err != nil {
		t.Fatalf("data cleanup failure must not be fatal, got %v", err)
	}
	if !strings.Contains(out.String(), "WARNING: data cleanup failed.") {
		t.Errorf("missing Node's warning, got %q", out.String())
	}
}

// addAdminUser is NOT wrapped in Node — a failure there aborts run() and the
// command exits 1. Being locked out must be loud, not silent.
func TestPostImportStepsAdminUserFailureIsFatal(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("e", &instancedata.InstanceData{
		SiteSlug: "e", Multisite: []byte("false"), AdminPassword: "seededpass1",
	}); err != nil {
		t.Fatal(err)
	}
	f := &fakeExecer{failOn: "dev-env-add-admin"}
	if err := postImportSteps(context.Background(), f, "e", postImportOptions{}, &bytes.Buffer{}); err == nil {
		t.Error("a failed vipgo admin user must fail the command (Node does not catch it)")
	}
}

// Node's flushCache is also uncaught (dev-env-import-sql.ts:128).
func TestPostImportStepsFlushCacheFailureIsFatal(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("e", &instancedata.InstanceData{
		SiteSlug: "e", Multisite: []byte("false"), AdminPassword: "seededpass1",
	}); err != nil {
		t.Fatal(err)
	}
	f := &fakeExecer{failOn: "cache flush"}
	if err := postImportSteps(context.Background(), f, "e", postImportOptions{}, &bytes.Buffer{}); err == nil {
		t.Error("a failed cache flush must fail the command (Node does not catch it)")
	}
	if len(f.calls) != 1 {
		t.Errorf("flush failure must abort before the later steps, ran %v", f.joined())
	}
}

// Node's addAdminUser regenerates the password when instance data has none (or
// the placeholder "password") and PERSISTS it, so `dev-env info` shows the
// credentials that actually work (dev-environment-database.ts:23-43).
func TestPostImportStepsGeneratesAndPersistsMissingAdminPassword(t *testing.T) {
	for _, seeded := range []string{"", "password"} {
		t.Run("seed="+seeded, func(t *testing.T) {
			t.Setenv("XDG_DATA_HOME", t.TempDir())
			if err := instancedata.Write("e", &instancedata.InstanceData{
				SiteSlug: "e", Multisite: []byte("false"), AdminPassword: seeded,
			}); err != nil {
				t.Fatal(err)
			}
			f := &fakeExecer{}
			if err := postImportSteps(context.Background(), f, "e", postImportOptions{}, &bytes.Buffer{}); err != nil {
				t.Fatal(err)
			}
			d, err := instancedata.Read("e")
			if err != nil {
				t.Fatal(err)
			}
			if len(d.AdminPassword) != passwordLength || d.AdminPassword == seeded {
				t.Fatalf("adminPassword not regenerated/persisted: %q", d.AdminPassword)
			}
			if !strings.Contains(strings.Join(f.joined(), "\n"), "--password="+d.AdminPassword) {
				t.Errorf("wp was given a different password than the one persisted: %v", f.joined())
			}
		})
	}
}

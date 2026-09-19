package devenv

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/devenv/paths"
)

func seedEnv(t *testing.T, slug string) {
	t.Helper()
	if err := instancedata.Write(slug, &instancedata.InstanceData{SiteSlug: slug, Multisite: []byte("false")}); err != nil {
		t.Fatal(err)
	}
}

func TestEnvVarSetGetDelete(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	seedEnv(t, "e")

	if err := EnvVarSet("e", "FOO", "bar"); err != nil {
		t.Fatal(err)
	}
	v, ok, err := EnvVarGet("e", "FOO")
	if err != nil || !ok || v != "bar" {
		t.Fatalf("EnvVarGet = %q,%v,%v want bar,true,nil", v, ok, err)
	}
	all, err := EnvVarGetAll("e")
	if err != nil || all["FOO"] != "bar" {
		t.Fatalf("EnvVarGetAll = %v, %v", all, err)
	}
	names, err := EnvVarList("e")
	if err != nil || len(names) != 1 || names[0] != "FOO" {
		t.Fatalf("EnvVarList = %v, %v", names, err)
	}
	if removed, err := EnvVarDelete("e", "FOO"); err != nil || !removed {
		t.Fatalf("EnvVarDelete = %v, %v; want removed", removed, err)
	}
	_, ok, _ = EnvVarGet("e", "FOO")
	if ok {
		t.Fatal("FOO should be deleted")
	}
}

func TestEnvVarListSorted(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	seedEnv(t, "e")
	_ = EnvVarSet("e", "B", "2")
	_ = EnvVarSet("e", "A", "1")
	names, _ := EnvVarList("e")
	if len(names) != 2 || names[0] != "A" || names[1] != "B" {
		t.Fatalf("EnvVarList not sorted: %v", names)
	}
}

// writeNodeEnvFile simulates `vip dev-env envvar set` run by the Node CLI:
// it writes <envdir>/.env in Node's format (env-vars.ts quoteEnvValue).
func writeNodeEnvFile(t *testing.T, slug, content string) {
	t.Helper()
	dir := paths.EnvironmentPath(slug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(content), 0o644); err != nil { // #nosec G306
		t.Fatal(err)
	}
}

func readEnvFileForTest(t *testing.T, slug string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(paths.EnvironmentPath(slug), ".env")) // #nosec G304
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// Parity blocker B3, second half: the two CLIs used different backends
// entirely. Node reads <envdir>/.env; Go read instance_data.json. Set a
// variable with one CLI and the other silently saw nothing.
func TestEnvVarReadsVariablesSetByNodeCLI(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	seedEnv(t, "e")
	writeNodeEnvFile(t, "e", "# a comment\nMY_TOKEN=\"s3cr3t\"\nPLAIN=value\n")

	v, ok, err := EnvVarGet("e", "MY_TOKEN")
	if err != nil {
		t.Fatal(err)
	}
	if !ok || v != "s3cr3t" {
		t.Errorf("EnvVarGet(MY_TOKEN) = %q,%v; want s3cr3t,true — a variable set by the Node CLI is invisible to vip-next", v, ok)
	}
	names, err := EnvVarList("e")
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 2 || names[0] != "MY_TOKEN" || names[1] != "PLAIN" {
		t.Errorf("EnvVarList = %v; want [MY_TOKEN PLAIN]", names)
	}
}

// ...and the reverse direction: a variable set by vip-next must land in the
// file the Node CLI reads, quoted the way Node quotes it.
func TestEnvVarSetIsVisibleToNodeCLI(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	seedEnv(t, "e")
	if err := EnvVarSet("e", "API_KEY", "abc123"); err != nil {
		t.Fatal(err)
	}
	got := readEnvFileForTest(t, "e")
	if !strings.Contains(got, `API_KEY="abc123"`) {
		t.Errorf(".env does not carry the variable in Node's format:\n%s", got)
	}
}

// Setting or deleting a variable must not disturb the user's other lines.
func TestEnvVarSetPreservesOtherLines(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	seedEnv(t, "e")
	writeNodeEnvFile(t, "e", "# keep me\nEXISTING=\"one\"\nLANDO_HOST_USER_ID=1000\n")

	if err := EnvVarSet("e", "ADDED", "two"); err != nil {
		t.Fatal(err)
	}
	if removed, err := EnvVarDelete("e", "EXISTING"); err != nil || !removed {
		t.Fatalf("EnvVarDelete = %v, %v; want removed", removed, err)
	}
	got := readEnvFileForTest(t, "e")
	if !strings.Contains(got, "LANDO_HOST_USER_ID=1000") {
		t.Errorf("managed key lost:\n%s", got)
	}
	if !strings.Contains(got, `ADDED="two"`) {
		t.Errorf("new variable missing:\n%s", got)
	}
	if strings.Contains(got, "EXISTING=") {
		t.Errorf("deleted variable still present:\n%s", got)
	}
}

// The Go-managed LANDO_HOST_* keys are ours, not the user's: they must not show
// up in the envvar surface (Node's env file never contains them).
func TestEnvVarListHidesManagedKeys(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	seedEnv(t, "e")
	writeNodeEnvFile(t, "e", "LANDO_HOST_USER_ID=1000\nLANDO_HOST_GROUP_ID=1000\nREAL=\"x\"\n")

	names, err := EnvVarList("e")
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 1 || names[0] != "REAL" {
		t.Errorf("EnvVarList = %v; want [REAL] — LANDO_HOST_* are managed by vip-next, not user variables", names)
	}
}

// Migration: variables written by an earlier vip-next into instance_data.json
// must be carried into .env on first touch, never silently dropped.
func TestEnvVarMigratesLegacyInstanceDataVars(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("e", &instancedata.InstanceData{
		SiteSlug:  "e",
		Multisite: []byte("false"),
		EnvVars:   map[string]string{"LEGACY": "kept"},
	}); err != nil {
		t.Fatal(err)
	}

	v, ok, err := EnvVarGet("e", "LEGACY")
	if err != nil {
		t.Fatal(err)
	}
	if !ok || v != "kept" {
		t.Errorf("EnvVarGet(LEGACY) = %q,%v; want kept,true — legacy instance_data.json vars must migrate, not vanish", v, ok)
	}
}

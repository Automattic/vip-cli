package devenv

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/compose"
)

func TestMaterializeWritesFiles(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	v := compose.View{SiteSlug: "example", Domain: "vipdev.lndo.site", HostUID: "1000", HostGID: "1000"}
	dir, err := Materialize("example", v)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"docker-compose.yml", ".env", filepath.Join("nginx", "extra.conf")} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Fatalf("missing %s: %v", name, err)
		}
	}
	b, _ := os.ReadFile(filepath.Join(dir, "docker-compose.yml"))
	if len(b) == 0 {
		t.Fatal("empty docker-compose.yml")
	}
}

// Regression for parity blocker B3. Materialize used to os.WriteFile the whole
// of <envdir>/.env with just the two LANDO_HOST_* lines. It runs on create,
// start, rebuild, update and every envvar mutation — and <envdir> is the same
// directory the Node CLI uses (paths.EnvironmentPath is byte-identical to
// Node's getEnvironmentPath), where Node's `dev-env envvar` commands keep user
// variables. So `vip-next dev-env start` silently deleted variables a user had
// set with the Node CLI. Asserting the managed keys are present would not have
// caught this — assert the user's own lines survive.
func TestMaterializePreservesExistingEnvFile(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	v := compose.View{SiteSlug: "example", Domain: "vipdev.site", HostUID: "1000", HostGID: "1000"}
	dir, err := Materialize("example", v)
	if err != nil {
		t.Fatal(err)
	}

	// What the Node CLI leaves behind after `vip dev-env envvar set`.
	const userContent = "# set by the Node CLI\nMY_TOKEN=\"s3cr3t\"\nOTHER_VAR=\"plain\"\n"
	envPath := filepath.Join(dir, ".env")
	existing, err := os.ReadFile(envPath) // #nosec G304
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(envPath, append(existing, []byte(userContent)...), 0o644); err != nil { // #nosec G306
		t.Fatal(err)
	}

	// `dev-env start` re-materializes with the same view.
	if _, err := Materialize("example", v); err != nil {
		t.Fatal(err)
	}

	got, err := os.ReadFile(envPath) // #nosec G304
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`MY_TOKEN="s3cr3t"`, `OTHER_VAR="plain"`, "# set by the Node CLI"} {
		if !strings.Contains(string(got), want) {
			t.Errorf("re-materialize destroyed %q; .env is now:\n%s", want, got)
		}
	}
	// The managed keys must still be there exactly once — docker compose reads
	// them from .env to substitute ${LANDO_HOST_USER_ID} in docker-compose.yml.
	if n := strings.Count(string(got), "LANDO_HOST_USER_ID="); n != 1 {
		t.Errorf("LANDO_HOST_USER_ID appears %d times, want exactly 1:\n%s", n, got)
	}
	if n := strings.Count(string(got), "LANDO_HOST_GROUP_ID="); n != 1 {
		t.Errorf("LANDO_HOST_GROUP_ID appears %d times, want exactly 1:\n%s", n, got)
	}
}

// A changed host UID must actually take effect — preserving user lines must not
// freeze the managed ones.
func TestMaterializeUpdatesManagedKeysInPlace(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	base := compose.View{SiteSlug: "example", Domain: "vipdev.site", HostUID: "1000", HostGID: "1000"}
	dir, err := Materialize("example", base)
	if err != nil {
		t.Fatal(err)
	}
	envPath := filepath.Join(dir, ".env")
	existing, _ := os.ReadFile(envPath)                                                                // #nosec G304
	if err := os.WriteFile(envPath, append(existing, []byte("KEEP=\"me\"\n")...), 0o644); err != nil { // #nosec G306
		t.Fatal(err)
	}

	changed := base
	changed.HostUID, changed.HostGID = "501", "20"
	if _, err := Materialize("example", changed); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(envPath) // #nosec G304
	if !strings.Contains(string(got), "LANDO_HOST_USER_ID=501") ||
		!strings.Contains(string(got), "LANDO_HOST_GROUP_ID=20") {
		t.Errorf("managed keys not updated:\n%s", got)
	}
	if strings.Contains(string(got), "LANDO_HOST_USER_ID=1000") {
		t.Errorf("stale managed value left behind:\n%s", got)
	}
	if !strings.Contains(string(got), `KEEP="me"`) {
		t.Errorf("user line lost:\n%s", got)
	}
}

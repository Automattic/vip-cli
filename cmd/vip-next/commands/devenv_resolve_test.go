package commands

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
)

// newSlugCmd builds a cobra command with a --slug flag + --non-interactive,
// mirroring what the real dev-env leaves register.
func newSlugCmd(slug string) *cobra.Command {
	c := &cobra.Command{Use: "x"}
	c.Flags().String("slug", "", "")
	c.Flags().Bool("non-interactive", false, "")
	// --app/--env live on the root command in production; the alias
	// PersistentPreRunE sets them from an @app.env token.
	c.Flags().String("app", "", "")
	c.Flags().String("env", "", "")
	if slug != "" {
		_ = c.Flags().Set("slug", slug)
	}
	return c
}

func mkEnv(t *testing.T, base, slug string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(base, "vip", "dev-environment", slug), 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestResolveSlugFlagWins(t *testing.T) {
	got, err := ResolveSlug(newSlugCmd("chosen"))
	if err != nil || got != "chosen" {
		t.Fatalf("ResolveSlug = %q, %v; want chosen", got, err)
	}
}

func TestResolveSlugSoleEnv(t *testing.T) {
	base := t.TempDir()
	t.Setenv("XDG_DATA_HOME", base)
	mkEnv(t, base, "only-one")
	got, err := ResolveSlug(newSlugCmd(""))
	if err != nil || got != "only-one" {
		t.Fatalf("ResolveSlug = %q, %v; want only-one", got, err)
	}
}

func TestResolveSlugNoneIsError(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	_, err := ResolveSlug(newSlugCmd(""))
	if err == nil {
		t.Fatal("expected error when no environments exist")
	}
}

// writeDevEnvConfig drops a .wpvip/vip-dev-env.yml in dir.
func writeDevEnvConfig(t *testing.T, dir, slug string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, ".wpvip"), 0o755); err != nil {
		t.Fatal(err)
	}
	body := "configuration-version: 1\nslug: " + slug + "\n"
	if err := os.WriteFile(filepath.Join(dir, ".wpvip", "vip-dev-env.yml"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

// Register 2.21. In a configured repo every dev-env command must target the
// configured environment, NOT whichever environment happens to be on disk.
// Before this fix `dev-env destroy` in a repo configured for "configured-site"
// destroyed the unrelated environment "some-other-env".
func TestResolveSlugUsesConfigurationFile(t *testing.T) {
	base := t.TempDir()
	t.Setenv("XDG_DATA_HOME", base)
	mkEnv(t, base, "some-other-env")
	repo := t.TempDir()
	writeDevEnvConfig(t, repo, "configured-site")
	t.Chdir(repo)

	got, err := ResolveSlug(newSlugCmd(""))
	if err != nil {
		t.Fatal(err)
	}
	if got != "configured-site" {
		t.Fatalf("ResolveSlug = %q, want configured-site (from .wpvip/vip-dev-env.yml)", got)
	}
}

// Node prints `Using environment <slug> from <path>` when the configuration
// file decides the target (dev-environment-cli.ts:170-176).
func TestResolveSlugPrintsUsingEnvironment(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	repo := t.TempDir()
	writeDevEnvConfig(t, repo, "configured-site")
	t.Chdir(repo)

	c := newSlugCmd("")
	var out bytes.Buffer
	c.SetOut(&out)
	if _, err := ResolveSlug(c); err != nil {
		t.Fatal(err)
	}
	want := "Using environment configured-site from " + filepath.Join(repo, ".wpvip", "vip-dev-env.yml")
	if !strings.Contains(out.String(), want) {
		t.Errorf("output = %q, want it to contain %q", out.String(), want)
	}
}

// --slug beats the configuration file (Node checks options.slug first).
func TestResolveSlugFlagBeatsConfigurationFile(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	repo := t.TempDir()
	writeDevEnvConfig(t, repo, "configured-site")
	t.Chdir(repo)

	got, err := ResolveSlug(newSlugCmd("explicit"))
	if err != nil {
		t.Fatal(err)
	}
	if got != "explicit" {
		t.Fatalf("ResolveSlug = %q, want explicit", got)
	}
}

// A broken configuration file must be fatal, not silently ignored — otherwise
// `destroy` falls through to some other environment.
func TestResolveSlugBrokenConfigurationFileIsFatal(t *testing.T) {
	base := t.TempDir()
	t.Setenv("XDG_DATA_HOME", base)
	mkEnv(t, base, "some-other-env")
	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, ".wpvip"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, ".wpvip", "vip-dev-env.yml"), []byte("slug: x\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(repo)

	if _, err := ResolveSlug(newSlugCmd("")); err == nil {
		t.Fatal("a malformed configuration file must fail, not fall through to another environment")
	}
}

// Node rejects @app.env on every dev-env command except create
// (getEnvironmentName: allowAppEnv is only set by vip-dev-env-create.js:95).
// The message tells the user the --slug form to use instead.
func TestResolveSlugRejectsAppEnvAlias(t *testing.T) {
	base := t.TempDir()
	t.Setenv("XDG_DATA_HOME", base)
	mkEnv(t, base, "only-one")
	c := newSlugCmd("")
	_ = c.Flags().Set("app", "example-app")
	_ = c.Flags().Set("env", "develop")

	_, err := ResolveSlug(c)
	if err == nil {
		t.Fatal("@app.env must be rejected on a dev-env command")
	}
	const want = "This command does not support @app.env notation. Use '--slug=example-app-develop' to target the local environment."
	if err.Error() != want {
		t.Errorf("error = %q, want %q", err.Error(), want)
	}
}

// Node builds the suggested slug from app + "-" + env, and omits the suffix
// when there is no env part.
func TestResolveSlugRejectsAppAliasWithoutEnv(t *testing.T) {
	base := t.TempDir()
	t.Setenv("XDG_DATA_HOME", base)
	mkEnv(t, base, "only-one")
	c := newSlugCmd("")
	_ = c.Flags().Set("app", "example-app")

	_, err := ResolveSlug(c)
	if err == nil || !strings.Contains(err.Error(), "--slug=example-app'") {
		t.Fatalf("error = %v, want the bare app name in the suggested --slug", err)
	}
}

// `dev-env sync sql` is the one dev-env leaf where @app.env is meaningful: it
// names the PLATFORM environment to export from, while the local target comes
// from --slug/the configuration file. Node strips app/env before calling
// getEnvironmentName (`const { app, env, ... } = opt` in
// vip-dev-env-sync-sql.js), so the guard must not fire there.
func TestResolveLocalSlugIgnoresAppEnvForSync(t *testing.T) {
	base := t.TempDir()
	t.Setenv("XDG_DATA_HOME", base)
	mkEnv(t, base, "only-one")
	c := newSlugCmd("")
	_ = c.Flags().Set("app", "example-app")
	_ = c.Flags().Set("env", "develop")

	got, err := ResolveLocalSlug(c)
	if err != nil {
		t.Fatalf("sync sql must accept @app.env: %v", err)
	}
	if got != "only-one" {
		t.Fatalf("ResolveLocalSlug = %q, want only-one", got)
	}
}

func TestResolveSlugAmbiguousNonInteractive(t *testing.T) {
	base := t.TempDir()
	t.Setenv("XDG_DATA_HOME", base)
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	mkEnv(t, base, "a")
	mkEnv(t, base, "b")
	_, err := ResolveSlug(newSlugCmd(""))
	if !errors.Is(err, appctx.ErrNonInteractive) {
		t.Fatalf("want ErrNonInteractive, got %v", err)
	}
}

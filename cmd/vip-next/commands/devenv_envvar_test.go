package commands

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/devenv/paths"
)

// seedEnvvarEnv creates one on-disk environment so ResolveSlug finds it.
func seedEnvvarEnv(t *testing.T) {
	t.Helper()
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	t.Chdir(t.TempDir()) // no .wpvip config file in scope
	if err := instancedata.Write("only-one", &instancedata.InstanceData{
		SiteSlug: "only-one", Multisite: []byte("false"),
	}); err != nil {
		t.Fatal(err)
	}
}

func runEnvvar(t *testing.T, args ...string) (string, error) {
	t.Helper()
	root := newDevEnvEnvvarCmd()
	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)
	root.SetArgs(args)
	err := root.Execute()
	return out.String(), err
}

// Node validates every dev-env envvar name through validateNameWithMessage
// (vip-dev-env-envvar-set.js:52) and exits 1 on failure. vip-next accepted
// anything, so a lowercase or hyphenated name landed in .env where it is not a
// valid shell identifier and is silently ignored by the container.
func TestEnvvarSetRejectsInvalidNames(t *testing.T) {
	for _, name := range []string{"lower_case", "MY-VAR", "1STVAR", "_LEADING", "HAS SPACE"} {
		t.Run(name, func(t *testing.T) {
			seedEnvvarEnv(t)
			_, err := runEnvvar(t, "set", name, "value")
			if err == nil {
				t.Fatalf("name %q must be rejected", name)
			}
			if !strings.Contains(err.Error(), "must consist of A-Z, 0-9, or _") {
				t.Errorf("error = %q, want Node's message", err)
			}
			if v, ok, _ := devenv.EnvVarGet("only-one", name); ok {
				t.Errorf("invalid name was written anyway: %q", v)
			}
		})
	}
}

func TestEnvvarSetAcceptsValidNames(t *testing.T) {
	for _, name := range []string{"MY_VAR", "A", "X1_2"} {
		t.Run(name, func(t *testing.T) {
			seedEnvvarEnv(t)
			if _, err := runEnvvar(t, "set", name, "value"); err != nil {
				t.Fatalf("name %q must be accepted: %v", name, err)
			}
		})
	}
}

// Node trims the name before validating and storing (`args[0]?.trim()`).
func TestEnvvarSetTrimsName(t *testing.T) {
	seedEnvvarEnv(t)
	if _, err := runEnvvar(t, "set", "  MY_VAR  ", "value"); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := devenv.EnvVarGet("only-one", "MY_VAR"); !ok {
		t.Error("the trimmed name should have been stored")
	}
}

// Node's readFromFile TRIMS the file contents (src/lib/read-file.ts:8). Without
// it a trailing newline becomes part of the value, so an API token read from a
// file is silently wrong.
func TestEnvvarSetFromFileTrims(t *testing.T) {
	seedEnvvarEnv(t)
	f := filepath.Join(t.TempDir(), "token.txt")
	if err := os.WriteFile(f, []byte("  sk-secret-token\n\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := runEnvvar(t, "set", "API_TOKEN", "--from-file", f); err != nil {
		t.Fatal(err)
	}
	v, ok, err := devenv.EnvVarGet("only-one", "API_TOKEN")
	if err != nil || !ok {
		t.Fatalf("not set: %v %v", ok, err)
	}
	if v != "sk-secret-token" {
		t.Errorf("value = %q, want the trimmed token", v)
	}
}

// `get` and `delete` do NOT validate in Node (only `set` calls
// validateNameWithMessage) — they just trim and report "does not exist".
// Matched deliberately: adding validation there would reject names a user could
// legitimately have on disk from an older CLI.
func TestEnvvarGetAndDeleteTrimButDoNotValidate(t *testing.T) {
	seedEnvvarEnv(t)
	if _, err := runEnvvar(t, "set", "MY_VAR", "value"); err != nil {
		t.Fatal(err)
	}
	if _, err := runEnvvar(t, "get", "  MY_VAR  "); err != nil {
		t.Errorf("get should trim the name: %v", err)
	}
	if _, err := runEnvvar(t, "delete", "  MY_VAR  "); err != nil {
		t.Errorf("delete should trim the name: %v", err)
	}
	if _, ok, _ := devenv.EnvVarGet("only-one", "MY_VAR"); ok {
		t.Error("delete with a padded name should have removed the variable")
	}
}

// Node EXITS 1 when the variable does not exist: it writes
// `The environment variable "<name>" does not exist` to stderr and sets
// process.exitCode = 1, and — note — never calls updateEnvFile, so .env is left
// byte-for-byte alone (src/bin/vip-dev-env-envvar-delete.js:51-54).
//
// vip-next printed "Deleted …" and exited 0, so a typo'd variable name in a CI
// script reported a successful delete that never happened.
func TestEnvvarDeleteMissingVariableExitsNonZero(t *testing.T) {
	seedEnvvarEnv(t)
	if _, err := runEnvvar(t, "set", "KEEP_ME", "value"); err != nil {
		t.Fatal(err)
	}
	envFile := filepath.Join(paths.EnvironmentPath("only-one"), ".env")
	before, err := os.ReadFile(envFile)
	if err != nil {
		t.Fatal(err)
	}

	out, err := runEnvvar(t, "delete", "NOT_THERE")
	if err == nil {
		t.Fatal("deleting a variable that does not exist must fail (Node exits 1)")
	}
	if !strings.Contains(err.Error(), `The environment variable "NOT_THERE" does not exist`) {
		t.Errorf("err = %q, want Node's does-not-exist message", err)
	}
	if strings.Contains(out, "Deleted") {
		t.Errorf("a failed delete must not claim success; output = %q", out)
	}

	// The delete demonstrably did not happen: .env is untouched and the other
	// variable is intact.
	after, err := os.ReadFile(envFile)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(before) {
		t.Errorf(".env was rewritten on a no-op delete:\n before %q\n after  %q", before, after)
	}
	if v, ok, _ := devenv.EnvVarGet("only-one", "KEEP_ME"); !ok || v != "value" {
		t.Errorf("unrelated variable was disturbed: %q ok=%v", v, ok)
	}
}

// Guard against over-correcting the fix above: a delete that DOES remove
// something still succeeds, prints the success line, and drops the variable.
func TestEnvvarDeleteExistingVariableSucceeds(t *testing.T) {
	seedEnvvarEnv(t)
	if _, err := runEnvvar(t, "set", "GONE_SOON", "value"); err != nil {
		t.Fatal(err)
	}
	out, err := runEnvvar(t, "delete", "GONE_SOON")
	if err != nil {
		t.Fatalf("deleting an existing variable must succeed: %v", err)
	}
	if !strings.Contains(out, "Deleted") {
		t.Errorf("output = %q, want the success line", out)
	}
	if _, ok, _ := devenv.EnvVarGet("only-one", "GONE_SOON"); ok {
		t.Error("the variable is still set after a successful delete")
	}
}

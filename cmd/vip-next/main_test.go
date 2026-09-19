package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"runtime"
	"slices"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/telemetry"
)

// buildBinary compiles vip-next into a temp file and returns the path.
// Each test that needs the real binary calls this once.
func buildBinary(t *testing.T) string {
	t.Helper()
	bin := t.TempDir() + "/vip-next"
	if runtime.GOOS == "windows" {
		bin += ".exe" // `go build` writes vip-next.exe on Windows; exec needs the real name
	}
	cmd := exec.Command("go", "build",
		"-buildvcs=false",
		"-ldflags=-X github.com/Automattic/vip/internal/version.Version=test1.0 -X github.com/Automattic/vip/internal/version.Commit=deadbee",
		"-o", bin,
		".")
	cmd.Env = os.Environ()
	cmd.Stderr = &bytes.Buffer{}
	if err := cmd.Run(); err != nil {
		t.Fatalf("build: %v\n%s", err, cmd.Stderr)
	}
	return bin
}

// runBinary executes the compiled binary with the given args and returns its
// combined output and exit error. DO_NOT_TRACK=1 is injected so telemetry
// construction never touches the OS keychain during tests.
func runBinary(bin string, args ...string) *exec.Cmd {
	cmd := exec.Command(bin, args...)
	cmd.Env = append(os.Environ(), "DO_NOT_TRACK=1")
	return cmd
}

func TestVersionFlag(t *testing.T) {
	bin := buildBinary(t)
	out, err := runBinary(bin, "--version").Output()
	if err != nil {
		t.Fatalf("--version: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, "vip-next test1.0") || !strings.Contains(got, "deadbee") {
		t.Errorf("--version output = %q", got)
	}
}

func TestHelpFlag(t *testing.T) {
	bin := buildBinary(t)
	out, err := runBinary(bin, "--help").Output()
	if err != nil {
		t.Fatalf("--help: %v", err)
	}
	if !strings.Contains(string(out), "Usage:") {
		t.Errorf("--help missing Usage block: %q", out)
	}
}

func TestAliasStrippedFromArgvSuccess(t *testing.T) {
	bin := buildBinary(t)
	// `--help` after the alias should print help and exit 0.
	// We assert the binary did not error out on the @ token.
	cmd := runBinary(bin, "@my-app.staging", "--help")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("expected exit 0 with alias + --help, got err=%v\n%s", err, out)
	}
}

func TestAliasAndAppFlagConflict(t *testing.T) {
	bin := buildBinary(t)
	cmd := runBinary(bin, "@my-app", "--app", "other-app", "--help")
	out, err := cmd.CombinedOutput()
	if err == nil {
		t.Fatalf("expected non-zero exit on alias+--app conflict; got 0\n%s", out)
	}
	if !strings.Contains(string(out), "cannot combine @app alias with --app/--env") {
		t.Errorf("unexpected error message: %q", out)
	}
}

func TestAliasAndEnvFlagConflict(t *testing.T) {
	bin := buildBinary(t)
	cmd := runBinary(bin, "@my-app", "--env", "staging", "--help")
	out, err := cmd.CombinedOutput()
	if err == nil {
		t.Fatalf("expected non-zero exit on @app + --env conflict; got 0\n%s", out)
	}
	if !strings.Contains(string(out), "cannot combine @app alias with --app/--env") {
		t.Errorf("unexpected error message: %q", out)
	}
}

func TestWhoamiSubcommandRegistered(t *testing.T) {
	bin := buildBinary(t)
	out, err := runBinary(bin, "whoami", "--help").Output()
	if err != nil {
		t.Fatalf("whoami --help: %v", err)
	}
	if !strings.Contains(string(out), "Retrieve details about the current authenticated VIP-CLI user.") {
		t.Errorf("whoami help missing description: %q", out)
	}
}

func TestNormalizeWPArgs(t *testing.T) {
	cases := []struct {
		name     string
		in       []string
		wantArgv []string
		wantYes  bool
	}{
		{"plain wp", []string{"wp", "site", "list"}, []string{"wp", "site", "list"}, false},
		{"dash-separated (post-alias)", []string{"--", "wp", "site", "list"}, []string{"wp", "site", "list"}, false},
		{"yes before dash", []string{"--yes", "--", "wp", "user", "list"}, []string{"wp", "user", "list"}, true},
		{"yes plain", []string{"--yes", "wp", "user", "list"}, []string{"wp", "user", "list"}, true},
		{"wp flags preserved", []string{"wp", "post", "list", "--posts_per_page=100"}, []string{"wp", "post", "list", "--posts_per_page=100"}, false},
		{"subshell via dash", []string{"--", "wp"}, []string{"wp"}, false},
		{"non-wp untouched", []string{"app", "list"}, []string{"app", "list"}, false},
		{"non-wp with dash untouched", []string{"--", "app", "list"}, []string{"--", "app", "list"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotArgv, gotYes := normalizeWPArgs(tc.in)
			if !slices.Equal(gotArgv, tc.wantArgv) {
				t.Errorf("argv = %v, want %v", gotArgv, tc.wantArgv)
			}
			if gotYes != tc.wantYes {
				t.Errorf("yes = %v, want %v", gotYes, tc.wantYes)
			}
		})
	}
}

func TestDefensiveModeSubcommandRegistered(t *testing.T) {
	bin := buildBinary(t)
	out, err := runBinary(bin, "defensive-mode", "--help").Output()
	if err != nil {
		t.Fatalf("defensive-mode --help: %v", err)
	}
	for _, want := range []string{"enable", "disable", "configure"} {
		if !strings.Contains(string(out), want) {
			t.Errorf("help missing subcommand %q: %q", want, out)
		}
	}
}

func TestRunResumesCommandAfterAutomaticLogin(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "1")
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	freshRaw := validBootstrapRaw(t, 10000)
	requestCount := 0
	authorization := ""
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		authorization = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"apps":{"total":0,"nextCursor":null,"edges":[]}}}`))
	}))
	defer srv.Close()
	t.Setenv("API_HOST", srv.URL)

	backend := &bootstrapBackend{}
	testKeychain := newBootstrapKeychain(backend)
	loginCalls := 0
	err := runWithDeps([]string{"app", "list", "--format=json"}, runDeps{
		Tracker: &telemetry.Tracker{Disabled: true},
		NewKeychain: func(string) *keychain.Keychain {
			return testKeychain
		},
		NewLogin: func(*auth.Store) func() (*auth.Token, error) {
			return func() (*auth.Token, error) {
				loginCalls++
				return auth.ParseToken(freshRaw)
			}
		},
	})
	if err != nil {
		t.Fatalf("runWithDeps: %v", err)
	}
	if loginCalls != 1 {
		t.Fatalf("login calls = %d, want 1", loginCalls)
	}
	if requestCount != 1 {
		t.Fatalf("GraphQL requests = %d, want 1", requestCount)
	}
	if authorization != "Bearer "+freshRaw {
		t.Fatalf("Authorization = %q, want fresh token", authorization)
	}
}

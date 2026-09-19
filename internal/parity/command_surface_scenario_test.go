//go:build parity

package parity

// TestCommandSurfaceScenarios tests the command-surface completion milestone:
// login, logout, search-replace, dev-env stubs, config software get/update.
//
// Each subtest is hermetic (httptest servers, temp files, in-process fakes).

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
)

// ─── helpers ────────────────────────────────────────────────────────────────

// commandSurfaceBaseEnv is the common env for all command-surface scenarios.
func commandSurfaceBaseEnv() map[string]string {
	return map[string]string{
		"DO_NOT_TRACK": "1",
		"NODE_ENV":     "test",
		"NO_COLOR":     "1",
	}
}

// csResolveAppJSON is the resolve-app response for parityapp/develop (typeId 2,
// WordPress). Used by scenarios that need app resolution.
const csResolveAppJSON = `{"data":{"apps":{"edges":[{"id":42,"name":"parityapp","typeId":2,"environments":[{"id":7,"appId":42,"name":"develop","type":"develop","defaultDomain":"d.example"}]}]}}}`

// csSoftwareSettingsJSON is the SoftwareSettings response body for a WP
// environment (typeId 2). WordPress has current="6.3" and option "6.4".
// PHP, muplugins, and nodejs are null (single-component focus keeps the
// fixture simple).
const csSoftwareSettingsJSON = `{"data":{"app":{"id":42,"name":"parityapp","typeId":2,"environments":[{"id":7,"appId":42,"type":"develop","name":"develop","softwareSettings":{"wordpress":{"name":"WordPress","slug":"wordpress","pinned":false,"current":{"version":"6.3","default":false,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"6.4","private":false},"options":[{"version":"6.3","default":false,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"6.4","private":false},{"version":"6.4","default":true,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"6.4","private":false}]},"php":null,"muplugins":null,"nodejs":null}}]}}}`

// csUpdateMutationOKJSON is a successful UpdateSoftwareSettings mutation body.
const csUpdateMutationOKJSON = `{"data":{"updateSoftwareSettings":{"wordpress":null,"php":null,"muplugins":null,"nodejs":null}}}`

// csSoftwareJobSuccessJSON is a SoftwareUpdateJob poll response: success.
const csSoftwareJobSuccessJSON = `{"data":{"app":{"id":42,"environments":[{"id":7,"jobs":[{"__typename":"Job","type":"software_update","completedAt":"2024-01-01T00:01:00Z","createdAt":"2024-01-01T00:00:00Z","inProgressLock":false,"progress":{"status":"success","steps":[]}}]}]}}}`

// csMux builds an httptest server that routes GraphQL requests by operationName.
// resolveApp, softwareSettings, updateMutation, and softwareJob bodies can each
// be nil (the server returns {"data":null} for unrecognized ops).
//
// Returns the handler and a hit-counter for UpdateSoftwareSettings mutations.
func csMux(
	t *testing.T,
	resolveApp []byte,
	softwareSettings []byte,
	updateMutation []byte,
	softwareJob []byte,
) (http.Handler, func() int32) {
	t.Helper()

	null := []byte(`{"data":null}`)
	serve := func(w http.ResponseWriter, body []byte) {
		if body == nil {
			body = null
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}

	var updateHits int32

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		switch {
		case strings.Contains(s, `"operationName":"ResolveAppByName"`),
			strings.Contains(s, `"operationName":"ResolveAppByID"`):
			serve(w, resolveApp)
		case strings.Contains(s, `"operationName":"SoftwareSettings"`):
			serve(w, softwareSettings)
		case strings.Contains(s, `"operationName":"UpdateSoftwareSettings"`):
			atomic.AddInt32(&updateHits, 1)
			serve(w, updateMutation)
		case strings.Contains(s, `"operationName":"SoftwareUpdateJob"`):
			serve(w, softwareJob)
		default:
			serve(w, nil)
		}
	}), func() int32 { return atomic.LoadInt32(&updateHits) }
}

// fakeSRBin writes a POSIX shell script that passes stdin directly to stdout
// (identity replacement — we test plumbing, not the replacement logic).
// The binary honours the go-search-replace calling convention: it reads stdin
// and writes replaced content to stdout; replacement-pair args are ignored in
// this stub. The file is marked executable.
//
// Skip on Windows (POSIX shebang not supported there).
func fakeSRBin(t *testing.T) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake search-replace binary is POSIX-only")
	}
	dir := t.TempDir()
	p := filepath.Join(dir, "go-search-replace")
	// Pass stdin to stdout unchanged so the output equals the input.
	if err := os.WriteFile(p, []byte("#!/bin/sh\ncat\n"), 0o755); err != nil { // #nosec G306
		t.Fatalf("write fake sr bin: %v", err)
	}
	return p
}

// ─── subtests ────────────────────────────────────────────────────────────────

func TestCommandSurfaceScenarios(t *testing.T) {
	goBin := buildVipNextWithVersion(t, "test", "test")

	// ── 1. dev-env routing ────────────────────────────────────────────────────
	// dev-env subcommands are implemented (Plan 5) and auth-bypassed (no
	// VIP_TOKEN_OVERRIDE or GraphQL server needed). These scenarios assert the
	// command tree routes to the right leaf and the leaf runs — with an isolated
	// (empty) data dir so they never touch the host's real environments.
	t.Run("dev-env-start-routes-to-leaf", func(t *testing.T) {
		env := commandSurfaceBaseEnv()
		env["XDG_DATA_HOME"] = t.TempDir() // hermetic: no real environments

		// `start --slug=foo` must reach the implemented start leaf and run it;
		// with no env on disk it fails reading the env's instance data. That
		// proves routing + auth-bypass (no auth wall, no "unknown command").
		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"dev-env", "start", "--slug=foo"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode == 0 {
			t.Errorf("exit=0, want non-zero (missing env should fail)\n  stderr: %s\n  stdout: %s",
				res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		if !strings.Contains(combined, "instance_data.json") {
			t.Errorf("expected env-not-found error from the start leaf; got:\n%s", combined)
		}
	})

	t.Run("dev-env-sync-sql-routes-to-child", func(t *testing.T) {
		// `sync sql` is a child of the special `sync` node; routing must descend
		// to the `sql` child rather than invoking `sync`'s RunE. The sql leaf is
		// wired through the appctx app/env middleware, so with no app provided it
		// fails "--app is required" — an error only the leaf's own middleware
		// chain emits (the parent `sync` has no RunE), proving routing reached the
		// child.
		env := commandSurfaceBaseEnv()
		env["XDG_DATA_HOME"] = t.TempDir()
		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"dev-env", "sync", "sql", "--slug=foo"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode == 0 {
			t.Errorf("exit=0, want non-zero\n  stderr: %s\n  stdout: %s",
				res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		if !strings.Contains(combined, "--app is required") {
			t.Errorf("expected sql leaf to require --app (proves nested routing); got:\n%s", combined)
		}
	})

	// ── 2. search-replace ─────────────────────────────────────────────────────
	// search-replace is auth-bypassed (no @app.env, no token needed). We set
	// VIP_SEARCH_REPLACE_BIN to a fake binary that passes stdin to stdout
	// unchanged so we can assert the plumbing without a real binary.
	//
	// search-replace is NOT on the cobra auth-bypass list (it's a standalone
	// command without @app), so the binary requires VIP_TOKEN_OVERRIDE to be
	// set (else it exits 1 with "not logged in"). However inspection of bypass.go
	// shows only login/logout/dev-env/help/version are bypassed — search-replace
	// needs a token. We supply one (even though no server is needed for the
	// redirect behaviour of vip search-replace).
	t.Run("search-replace-stdout", func(t *testing.T) {
		srBin := fakeSRBin(t)

		// Write a temp SQL file (plain mysqldump; cat stub returns it unchanged).
		tmpDir := t.TempDir()
		inputFile := filepath.Join(tmpDir, "dump.sql")
		content := "INSERT INTO wp_options (option_name) VALUES ('http://oldsite.example');\n"
		if err := os.WriteFile(inputFile, []byte(content), 0o600); err != nil {
			t.Fatalf("write input: %v", err)
		}

		// Stand up a minimal server so the token-auth path gets a valid resolve.
		// (search-replace is NOT app-context-aware, so the server will never
		// actually be queried — but the token check in main.go requires a valid
		// JWT to not reject before the command even runs.)
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":null}`))
		}))
		defer srv.Close()

		env := commandSurfaceBaseEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)
		env["VIP_SEARCH_REPLACE_BIN"] = srBin

		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"search-replace", inputFile, "--search-replace=from,to"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 0 {
			t.Errorf("exit=%d, want 0\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		// Fake binary (cat) returns the content unchanged; command streams it to
		// stdout.
		if !strings.Contains(res.Stdout, "wp_options") {
			t.Errorf("stdout missing expected SQL content; got %q", res.Stdout)
		}
	})

	t.Run("search-replace-inplace", func(t *testing.T) {
		srBin := fakeSRBin(t)

		tmpDir := t.TempDir()
		inputFile := filepath.Join(tmpDir, "dump.sql")
		content := "SELECT 1;\n"
		if err := os.WriteFile(inputFile, []byte(content), 0o600); err != nil {
			t.Fatalf("write input: %v", err)
		}

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":null}`))
		}))
		defer srv.Close()

		env := commandSurfaceBaseEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)
		env["VIP_SEARCH_REPLACE_BIN"] = srBin

		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"search-replace", inputFile, "--search-replace=SELECT,REPLACED", "--in-place"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		// This scenario used to assert exit 0 plus a rewritten file — i.e. it
		// enshrined parity blocker B2, an irreversible in-place rewrite with no
		// confirmation. Node prompts here and defaults to No
		// (search-and-replace.ts:151; the standalone bin passes no batchMode,
		// vip-search-replace.js:74). The harness runs the binary as a
		// subprocess with no TTY, so the confirm cannot be answered and the
		// command must refuse without touching the file.
		if res.ExitCode == 0 {
			t.Errorf("exit=0: --in-place must not proceed when the confirmation cannot be shown\n  stderr: %s", res.Stderr)
		}
		if !strings.Contains(res.Stderr, "This operation is not reversible") {
			t.Errorf("stderr missing Node's in-place confirmation text; got %q", res.Stderr)
		}
		got, err := os.ReadFile(inputFile)
		if err != nil {
			t.Fatalf("read inplace input: %v", err)
		}
		if string(got) != content {
			t.Errorf("input file was modified without confirmation:\n got %q\nwant %q", got, content)
		}
	})

	// ── 3. logout ─────────────────────────────────────────────────────────────
	// logout is auth-bypassed (no login required). Stand up a server to capture
	// POST /logout; set VIP_TOKEN_OVERRIDE so store.Load returns a token and
	// PostLogout actually fires.
	t.Run("logout", func(t *testing.T) {
		var (
			logoutHits int32
			lastMethod string
			lastPath   string
		)
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/logout" {
				atomic.AddInt32(&logoutHits, 1)
				lastMethod = r.Method
				lastPath = r.URL.Path
			}
			w.WriteHeader(http.StatusOK)
		}))
		defer srv.Close()

		env := commandSurfaceBaseEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"logout"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 0 {
			t.Errorf("exit=%d, want 0\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		if !strings.Contains(combined, "You are now logged out.") {
			t.Errorf("missing logout message; got:\n%s", combined)
		}
		if h := atomic.LoadInt32(&logoutHits); h != 1 {
			t.Errorf("POST /logout hits = %d, want 1", h)
		}
		if lastMethod != http.MethodPost || lastPath != "/logout" {
			t.Errorf("server saw %s %s, want POST /logout", lastMethod, lastPath)
		}
	})

	// ── 4. config-software-get ────────────────────────────────────────────────
	// Stand up a mux with SoftwareSettings + ResolveApp responses.
	// Assert exit 0 and that table output mentions WordPress/PHP (or just
	// WordPress, since PHP is null in our fixture).
	t.Run("config-software-get", func(t *testing.T) {
		handler, _ := csMux(t,
			[]byte(csResolveAppJSON),
			[]byte(csSoftwareSettingsJSON),
			nil,
			nil,
		)
		srv := httptest.NewServer(handler)
		defer srv.Close()

		env := commandSurfaceBaseEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"@parityapp.develop", "config", "software", "get"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 0 {
			t.Errorf("exit=%d, want 0\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		if !strings.Contains(combined, "WordPress") {
			t.Errorf("output missing 'WordPress'; got:\n%s", combined)
		}
		if !strings.Contains(combined, "6.3") {
			t.Errorf("output missing current version '6.3'; got:\n%s", combined)
		}
	})

	t.Run("config-software-get-json", func(t *testing.T) {
		handler, _ := csMux(t,
			[]byte(csResolveAppJSON),
			[]byte(csSoftwareSettingsJSON),
			nil,
			nil,
		)
		srv := httptest.NewServer(handler)
		defer srv.Close()

		env := commandSurfaceBaseEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"@parityapp.develop", "config", "software", "get", "--format=json"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 0 {
			t.Errorf("exit=%d, want 0\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		// stdout should be valid JSON
		var decoded any
		if err := json.Unmarshal([]byte(strings.TrimSpace(res.Stdout)), &decoded); err != nil {
			t.Errorf("--format=json output is not valid JSON: %v\n  stdout: %s", err, res.Stdout)
		}
	})

	// ── 5. config-software-update ─────────────────────────────────────────────
	// Mux returns: SoftwareSettings (for validation), UpdateSoftwareSettings OK,
	// SoftwareUpdateJob returning status="success" immediately (no sleep needed).
	// --yes skips the confirm prompt.
	t.Run("config-software-update", func(t *testing.T) {
		handler, updateHits := csMux(t,
			[]byte(csResolveAppJSON),
			[]byte(csSoftwareSettingsJSON),
			[]byte(csUpdateMutationOKJSON),
			[]byte(csSoftwareJobSuccessJSON),
		)
		srv := httptest.NewServer(handler)
		defer srv.Close()

		env := commandSurfaceBaseEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"@parityapp.develop", "config", "software", "update", "wordpress", "6.4", "--yes"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 0 {
			t.Errorf("exit=%d, want 0\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		// Success message from runConfigSoftwareUpdate.
		if !strings.Contains(combined, "Successfully updated") {
			t.Errorf("missing success message; got:\n%s", combined)
		}
		if h := updateHits(); h != 1 {
			t.Errorf("UpdateSoftwareSettings hits = %d, want 1", h)
		}
	})

	// ── 5b. config-software-update WITHOUT --yes ─────────────────────────────
	// The real-process assertion behind the exit-code fix. A subprocess has no
	// TTY on stdin, so this is exactly the shape of a CI run that forgot --yes:
	// the confirm cannot be answered, the update never happens, and the command
	// must FAIL.
	//
	// Node throws UserError( 'Update canceled' ) from promptForUpdate
	// (src/lib/config/software.ts:335); command.js's unhandledRejection handler
	// routes a UserError to exit.withError (src/lib/cli/command.js:27-28 →
	// src/lib/cli/exit.ts `process.exit( 1 )`). vip-next printed "Update
	// canceled" and exited 0, so CI reported a green software update on a no-op.
	t.Run("config-software-update-declined-exits-1", func(t *testing.T) {
		handler, updateHits := csMux(t,
			[]byte(csResolveAppJSON),
			[]byte(csSoftwareSettingsJSON),
			[]byte(csUpdateMutationOKJSON),
			[]byte(csSoftwareJobSuccessJSON),
		)
		srv := httptest.NewServer(handler)
		defer srv.Close()

		env := commandSurfaceBaseEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

		res, err := Run(RunSpec{
			Binary: goBin,
			// deliberately no --yes
			Argv: []string{"@parityapp.develop", "config", "software", "update", "wordpress", "6.4"},
			Env:  FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 1 {
			t.Errorf("exit=%d, want 1\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		if !strings.Contains(combined, "Update canceled") {
			t.Errorf("missing 'Update canceled'; got:\n%s", combined)
		}
		if strings.Contains(combined, "Successfully updated") {
			t.Errorf("a canceled update must not claim success; got:\n%s", combined)
		}
		// The whole point: the mutation never left the machine.
		if h := updateHits(); h != 0 {
			t.Errorf("UpdateSoftwareSettings hits = %d, want 0", h)
		}
	})

	// ── 6. login ─────────────────────────────────────────────────────────────
	// login is interactive (browser-open + token prompt) and cannot be driven
	// end-to-end in a hermetic test. The full flow calls survey.AskOne on the
	// real TTY; in a headless subprocess that gets EOF immediately, which is
	// not ErrLoginCancelled, so the command exits 1.
	//
	// What we CAN assert hermetically:
	//   • `vip help login` exits 0 and shows the "Authenticate" description.
	//     This confirms the command is registered and cobra routes help correctly.
	//
	// NOTE: browser-open + token-entry is a manual-test-only scenario, per the
	// spec's "not automated: browser-open" carve-out. login's surveyConfirm calls
	// survey.AskOne which reads a real TTY and cannot be injected at the binary
	// boundary. Testing the full login flow requires mocking at the login.go
	// level (done in internal/auth/login_test.go), not at the binary level.
	t.Run("login-help", func(t *testing.T) {
		env := commandSurfaceBaseEnv()
		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"help", "login"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 0 {
			t.Errorf("exit=%d, want 0\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		if !strings.Contains(combined, "uthenticat") { // "Authenticate" or "authenticate"
			t.Errorf("help output missing 'Authenticate'; got:\n%s", combined)
		}
	})
}

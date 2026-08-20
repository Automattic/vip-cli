//go:build parity

package parity

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

// phpmyadminMux returns a shared HTTP handler that answers the operations the
// db phpmyadmin flow can fire:
//
//   - ResolveAppByName  (WithAppContext)
//   - PhpMyAdminStatus  (the gate, then the poll)
//   - EnablePhpMyAdmin  (only when the gate says the env is not already up)
//   - GeneratePhpMyAdminAccess
//
// Per-op response bodies are read from the per-scenario recording directory
// so each scenario can override (e.g. error scenario serves a GraphQL error
// from enable.json).
func phpmyadminMux(t *testing.T, recordingDir string) (http.Handler, func() (en, st, gn int32)) {
	t.Helper()
	read := func(name string) []byte {
		b, err := os.ReadFile("../../testdata/parity/recordings/" + recordingDir + "/" + name)
		if err != nil {
			t.Fatalf("read %s/%s: %v", recordingDir, name, err)
		}
		return b
	}
	resolveAppBody := read("resolve-app.json")
	enableBody := read("enable.json")
	// Some scenarios (error) only have resolve-app + enable; status / generate
	// would never be reached. Read them lazily.
	maybeRead := func(name string) []byte {
		b, err := os.ReadFile("../../testdata/parity/recordings/" + recordingDir + "/" + name)
		if err != nil {
			return nil
		}
		return b
	}
	statusBody := maybeRead("status.json")
	generateBody := maybeRead("generate.json")

	var enableHits, statusHits, generateHits int32
	mux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		// `App` is Node's name for the same app resolution Go spells
		// ResolveAppByName/ByID (src/lib/api/app.ts:46,69). All three
		// operation names must be routed, or the real Node CLI falls through
		// to the default branch and dies resolving @parityapp.develop.
		case strings.Contains(s, `"operationName":"ResolveAppByName"`),
			strings.Contains(s, `"operationName":"ResolveAppByID"`),
			strings.Contains(s, `"operationName":"App"`):
			_, _ = w.Write(resolveAppBody)
		case strings.Contains(s, `"operationName":"EnablePhpMyAdmin"`):
			atomic.AddInt32(&enableHits, 1)
			_, _ = w.Write(enableBody)
		case strings.Contains(s, `"operationName":"PhpMyAdminStatus"`):
			atomic.AddInt32(&statusHits, 1)
			if statusBody == nil {
				_, _ = w.Write([]byte(`{"data":null}`))
				return
			}
			_, _ = w.Write(statusBody)
		case strings.Contains(s, `"operationName":"GeneratePhpMyAdminAccess"`):
			atomic.AddInt32(&generateHits, 1)
			if generateBody == nil {
				_, _ = w.Write([]byte(`{"data":null}`))
				return
			}
			_, _ = w.Write(generateBody)
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	})
	hits := func() (int32, int32, int32) {
		return atomic.LoadInt32(&enableHits), atomic.LoadInt32(&statusHits), atomic.LoadInt32(&generateHits)
	}
	return mux, hits
}

// TestPhpmyadminPrintParity exercises the happy path with --print: the
// generated URL must land on stdout, exit code 0.
func TestPhpmyadminPrintParity(t *testing.T) {
	mux, hits := phpmyadminMux(t, "phpmyadmin-print")
	srv := httptest.NewServer(mux)
	defer srv.Close()

	scenario, err := LoadScenario("../../testdata/parity/phpmyadmin-print.yaml")
	if err != nil {
		t.Fatalf("LoadScenario: %v", err)
	}
	if scenario.Env == nil {
		scenario.Env = map[string]string{}
	}
	scenario.Env["API_HOST"] = srv.URL
	scenario.Env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

	goBin := buildVipNextWithVersion(t, "test", "test")
	res, err := Run(RunSpec{Binary: goBin, Argv: scenario.Argv, Env: FixtureEnv(scenario.Env)})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.ExitCode != 0 {
		t.Errorf("exit = %d, want 0; stderr=%s; stdout=%s", res.ExitCode, res.Stderr, res.Stdout)
	}
	// The recording reports status "running", so Node's maybeEnablePhpMyAdmin
	// (phpmyadmin.ts:213-222) short-circuits: the environment is already up,
	// so NO enable mutation is sent. Go used to fire it on every invocation.
	en, st, gn := hits()
	if en != 0 {
		t.Errorf("enable hits = %d, want 0: status is already 'running'", en)
	}
	if st < 1 || gn != 1 {
		t.Errorf("hits status/generate = %d/%d, want >=1/1", st, gn)
	}
	if !strings.Contains(res.Stdout, "https://pma.parity.example/abc") {
		t.Errorf("stdout missing URL; got=%q", res.Stdout)
	}
}

// TestPhpmyadminSilentParity exercises --print --silent: URL still lands on
// stdout, stderr stays empty (no progress lines, no read-only warning).
func TestPhpmyadminSilentParity(t *testing.T) {
	mux, _ := phpmyadminMux(t, "phpmyadmin-silent")
	srv := httptest.NewServer(mux)
	defer srv.Close()

	scenario, err := LoadScenario("../../testdata/parity/phpmyadmin-silent.yaml")
	if err != nil {
		t.Fatalf("LoadScenario: %v", err)
	}
	if scenario.Env == nil {
		scenario.Env = map[string]string{}
	}
	scenario.Env["API_HOST"] = srv.URL
	scenario.Env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

	goBin := buildVipNextWithVersion(t, "test", "test")
	res, err := Run(RunSpec{Binary: goBin, Argv: scenario.Argv, Env: FixtureEnv(scenario.Env)})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.ExitCode != 0 {
		t.Errorf("exit = %d, want 0; stderr=%s; stdout=%s", res.ExitCode, res.Stderr, res.Stdout)
	}
	if !strings.Contains(res.Stdout, "https://pma.parity.example/silent") {
		t.Errorf("stdout missing URL; got=%q", res.Stdout)
	}
	if strings.TrimSpace(res.Stderr) != "" {
		t.Errorf("--silent must suppress all stderr; got=%q", res.Stderr)
	}
}

// TestPhpmyadminErrorParity: enable mutation returns a GraphQL error;
// the CLI must exit non-zero.
func TestPhpmyadminErrorParity(t *testing.T) {
	mux, hits := phpmyadminMux(t, "phpmyadmin-error")
	srv := httptest.NewServer(mux)
	defer srv.Close()

	scenario, err := LoadScenario("../../testdata/parity/phpmyadmin-error.yaml")
	if err != nil {
		t.Fatalf("LoadScenario: %v", err)
	}
	if scenario.Env == nil {
		scenario.Env = map[string]string{}
	}
	scenario.Env["API_HOST"] = srv.URL
	scenario.Env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

	goBin := buildVipNextWithVersion(t, "test", "test")
	res, err := Run(RunSpec{Binary: goBin, Argv: scenario.Argv, Env: FixtureEnv(scenario.Env)})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.ExitCode == 0 {
		t.Errorf("exit = 0, want non-zero (enable mutation errored); stderr=%s; stdout=%s",
			res.Stderr, res.Stdout)
	}
	// The status query now runs FIRST (it is what decides whether to enable
	// at all); this recording has no status.json, so the mux answers
	// `{"data":null}` — an unknown status — which is what sends us into the
	// enable branch. Generate must still never run after the enable error.
	en, st, gn := hits()
	if st != 1 {
		t.Errorf("status must be queried exactly once before enabling; got %d", st)
	}
	if en != 1 {
		t.Errorf("enable must be attempted for an unknown status; got %d", en)
	}
	if gn != 0 {
		t.Errorf("generate must not be called after enable error; got %d", gn)
	}
}

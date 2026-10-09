//go:build parity

package parity

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	json "encoding/json/v2"
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

func phpmyadminResidencyMux(t *testing.T, recordingDir, residency string) (http.Handler, func() map[string]int32) {
	t.Helper()
	base, baseHits := phpmyadminMux(t, recordingDir)
	body, err := os.ReadFile("../../testdata/parity/recordings/" + recordingDir + "/resolve-app.json")
	if err != nil {
		t.Fatalf("read resolve-app.json: %v", err)
	}
	var response map[string]any
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatalf("decode resolve-app.json: %v", err)
	}
	data := response["data"].(map[string]any)
	apps := data["apps"].(map[string]any)
	app := apps["edges"].([]any)[0].(map[string]any)
	env := app["environments"].([]any)[0].(map[string]any)
	switch residency {
	case "true":
		env["isK8sResident"] = true
	case "false":
		env["isK8sResident"] = false
	case "null":
		env["isK8sResident"] = nil
	case "missing":
		delete(env, "isK8sResident")
	default:
		t.Fatalf("unknown residency fixture %q", residency)
	}
	resolveBody, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("encode resolve-app.json: %v", err)
	}

	var resolves, missingSelection, malformedRequests int32
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			atomic.AddInt32(&malformedRequests, 1)
			http.Error(w, "read request", http.StatusBadRequest)
			return
		}
		var request struct {
			OperationName string `json:"operationName"`
			Query         string `json:"query"`
		}
		if err := json.Unmarshal(body, &request); err != nil {
			atomic.AddInt32(&malformedRequests, 1)
			http.Error(w, "decode request", http.StatusBadRequest)
			return
		}
		switch request.OperationName {
		case "App", "ResolveAppByName", "ResolveAppByID":
			atomic.AddInt32(&resolves, 1)
			if !strings.Contains(request.Query, "isK8sResident") {
				atomic.AddInt32(&missingSelection, 1)
				http.Error(w, "isK8sResident not selected", http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(resolveBody)
		default:
			r.Body = io.NopCloser(bytes.NewReader(body))
			base.ServeHTTP(w, r)
		}
	})
	hits := func() map[string]int32 {
		enable, status, generate := baseHits()
		return map[string]int32{
			"ResolveApp":       atomic.LoadInt32(&resolves),
			"MissingSelection": atomic.LoadInt32(&missingSelection),
			"MalformedRequest": atomic.LoadInt32(&malformedRequests),
			"Enable":           enable,
			"Status":           status,
			"Generate":         generate,
		}
	}
	return handler, hits
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
// stdout, stderr stays empty (no progress lines or access note).
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
	// Ambient environment noise is not something --silent has any say over: on
	// a headless host the keychain reports its file fallback before the command
	// ever runs. Strip the same rules the differ uses (ambientStderrRules) so
	// this assertion tests the flag rather than the runner.
	//
	// Whether --silent *ought* to suppress that notice too is a real question
	// about the flag's contract, and a separate one from this test.
	silentStderr, err := normalizeStderr(res.Stderr, nil)
	if err != nil {
		t.Fatalf("normalizeStderr: %v", err)
	}
	if strings.TrimSpace(silentStderr) != "" {
		t.Errorf("--silent must suppress all stderr; got=%q", silentStderr)
	}
}

func TestPhpmyadminSessionNoteDifferential(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestPhpmyadminSessionNoteDifferential — the phpMyAdmin Node-vs-Go note", skip))
	}

	for _, tc := range []struct {
		residency string
		note      string
	}{
		{residency: "true", note: "Note: phpMyAdmin sessions are read-only. If you run a query that writes to DB, it will fail."},
		{residency: "false", note: ""},
		{residency: "null", note: "Note: phpMyAdmin sessions are read-only on VIP Kubernetes and read-write on WP Cloud."},
		{residency: "missing", note: "Note: phpMyAdmin sessions are read-only on VIP Kubernetes and read-write on WP Cloud."},
	} {
		t.Run(tc.residency, func(t *testing.T) {
			for _, silent := range []bool{false, true} {
				name := "phpmyadmin-print"
				if silent {
					name = "phpmyadmin-silent"
				}
				t.Run(name, func(t *testing.T) {
					scenario, err := LoadScenario("../../testdata/parity/" + name + ".yaml")
					if err != nil {
						t.Fatalf("LoadScenario: %v", err)
					}
					scenario.Env = rig.scenarioEnv(scenario)
					mux := func(t *testing.T, recordingDir string) (http.Handler, func() map[string]int32) {
						return phpmyadminResidencyMux(t, recordingDir, tc.residency)
					}

					for _, side := range []struct {
						name string
						bin  string
					}{
						{name: "Node", bin: rig.nodeBin},
						{name: "Go", bin: rig.goBin},
					} {
						res, hits := rig.runSide(t, scenario, side.bin, mux)
						if res.ExitCode != 0 {
							t.Errorf("%s exit = %d; stdout=%q stderr=%q", side.name, res.ExitCode, res.Stdout, res.Stderr)
						}
						if hits["ResolveApp"] == 0 || hits["MissingSelection"] != 0 || hits["MalformedRequest"] != 0 {
							t.Errorf("%s app resolution hits = %v, want a query selecting isK8sResident", side.name, hits)
						}
						output := res.Stdout + res.Stderr
						noteCount, matchingCount := 0, 0
						for _, line := range strings.Split(output, "\n") {
							line = strings.TrimSpace(line)
							if strings.HasPrefix(line, "Note:") {
								noteCount++
							}
							if line == tc.note {
								matchingCount++
							}
						}
						if !silent && tc.note != "" && (noteCount != 1 || matchingCount != 1) {
							t.Errorf("%s note count = %d, exact matches = %d, want 1/1; stdout=%q stderr=%q", side.name, noteCount, matchingCount, res.Stdout, res.Stderr)
						}
						if (silent || tc.note == "") && noteCount != 0 {
							t.Errorf("%s printed an unexpected note; stdout=%q stderr=%q", side.name, res.Stdout, res.Stderr)
						}
					}
				})
			}
		})
	}

	for _, help := range []struct {
		name string
		argv []string
	}{
		{name: "db-help", argv: []string{"db", "--help"}},
		{name: "phpmyadmin-help", argv: []string{"db", "phpmyadmin", "--help"}},
	} {
		t.Run(help.name, func(t *testing.T) {
			for _, side := range []struct {
				name string
				bin  string
			}{
				{name: "Node", bin: rig.nodeBin},
				{name: "Go", bin: rig.goBin},
			} {
				res, err := Run(RunSpec{
					Binary: side.bin,
					Argv:   help.argv,
					Env:    FixtureEnv(rig.scenarioEnv(&Scenario{})),
				})
				if err != nil {
					t.Fatalf("run %s help: %v", side.name, err)
				}
				if res.ExitCode != 0 {
					t.Errorf("%s help exit = %d; stdout=%q stderr=%q", side.name, res.ExitCode, res.Stdout, res.Stderr)
				}
				output := strings.ToLower(res.Stdout + res.Stderr)
				if !strings.Contains(output, "phpmyadmin") {
					t.Errorf("%s help missing phpMyAdmin description: stdout=%q stderr=%q", side.name, res.Stdout, res.Stderr)
				}
				if strings.Contains(output, "read-only phpmyadmin") {
					t.Errorf("%s help retains blanket read-only description: stdout=%q stderr=%q", side.name, res.Stdout, res.Stderr)
				}
			}
		})
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

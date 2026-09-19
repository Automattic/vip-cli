//go:build parity

package parity

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

// syncMux dispatches GraphQL requests for the M6 sync scenarios.
//
// Operation → file mapping:
//
//	ResolveAppByName / ResolveAppByID -> resolve-app.json
//	SyncEnvironment                    -> sync-start.json
//	SyncProgress (1st hit)             -> sync-status-1.json
//	SyncProgress (subsequent)          -> sync-status-2.json
//
// The progress counter is exposed so tests can assert the poll loop
// actually ticked. Missing fixtures fall back to {"data":null}.
func syncMux(t *testing.T, recordingDir string) (http.Handler, func() (start, progress int32)) {
	t.Helper()
	base := "../../testdata/parity/recordings/" + recordingDir + "/"

	maybeRead := func(name string) []byte {
		b, err := os.ReadFile(base + name)
		if err != nil {
			return nil
		}
		return b
	}

	resolveAppBody := maybeRead("resolve-app.json")
	syncStartBody := maybeRead("sync-start.json")
	status1Body := maybeRead("sync-status-1.json")
	status2Body := maybeRead("sync-status-2.json")

	nullBody := []byte(`{"data":null}`)
	serve := func(w http.ResponseWriter, body []byte) {
		if body == nil {
			body = nullBody
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}

	var startHits, progressHits int32
	mux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		switch {
		// `App` is Node's app resolution (src/lib/api/app.ts:46,69).
		case strings.Contains(s, `"operationName":"ResolveAppByName"`),
			strings.Contains(s, `"operationName":"ResolveAppByID"`),
			strings.Contains(s, `"operationName":"App"`):
			serve(w, resolveAppBody)
		// Node names the same mutation SyncEnvironmentMutation
		// (src/bin/vip-sync.js:40); Go drops the suffix.
		case strings.Contains(s, `"operationName":"SyncEnvironment"`),
			strings.Contains(s, `"operationName":"SyncEnvironmentMutation"`):
			atomic.AddInt32(&startHits, 1)
			serve(w, syncStartBody)
		case strings.Contains(s, `"operationName":"SyncProgress"`):
			i := atomic.AddInt32(&progressHits, 1)
			if i == 1 {
				serve(w, status1Body)
			} else {
				serve(w, status2Body)
			}
		default:
			serve(w, nil)
		}
	})
	hits := func() (int32, int32) {
		return atomic.LoadInt32(&startHits), atomic.LoadInt32(&progressHits)
	}
	return mux, hits
}

var syncPrefixes = []string{
	"sync-",
}

func isSyncScenario(name string) bool {
	for _, p := range syncPrefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

// TestM6SyncScenarios discovers every YAML matching sync-* and runs it
// against syncMux. Both current scenarios should eventually reach the
// success status payload and exit 0.
func TestM6SyncScenarios(t *testing.T) {
	yamlDir := "../../testdata/parity"
	entries, err := filepath.Glob(yamlDir + "/*.yaml")
	if err != nil {
		t.Fatalf("glob yaml: %v", err)
	}

	var scenarios []string
	for _, path := range entries {
		base := strings.TrimSuffix(filepath.Base(path), ".yaml")
		if isSyncScenario(base) {
			scenarios = append(scenarios, path)
		}
	}
	if len(scenarios) == 0 {
		t.Fatal("no M6 sync scenarios found — testdata may have moved")
	}

	goBin := buildVipNextWithVersion(t, "test", "test")

	for _, path := range scenarios {
		scenarioName := strings.TrimSuffix(filepath.Base(path), ".yaml")

		t.Run(scenarioName, func(t *testing.T) {
			scenario, err := LoadScenario(path)
			if err != nil {
				t.Fatalf("LoadScenario(%s): %v", path, err)
			}

			if scenario.ExpectedDrift != nil {
				t.Skipf("expected drift (%s); skipping assertion for %s", scenario.ExpectedDrift.Reason, scenarioName)
				return
			}

			mux, hits := syncMux(t, scenario.Recording)
			srv := httptest.NewServer(mux)
			defer srv.Close()

			if scenario.Env == nil {
				scenario.Env = map[string]string{}
			}
			scenario.Env["API_HOST"] = srv.URL
			scenario.Env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

			res, err := Run(RunSpec{
				Binary: goBin,
				Argv:   scenario.Argv,
				Env:    FixtureEnv(scenario.Env),
			})
			if err != nil {
				t.Fatalf("Run(%s): %v", scenarioName, err)
			}

			if res.ExitCode != scenario.Expect.ExitCode {
				t.Errorf("%s: exit code = %d, want %d\n  stderr: %s\n  stdout: %s",
					scenarioName, res.ExitCode, scenario.Expect.ExitCode,
					res.Stderr, res.Stdout)
			}

			startHits, progressHits := hits()
			// Both scenarios fire the mutation exactly once.
			if startHits != 1 {
				t.Errorf("%s: SyncEnvironment hits = %d, want 1", scenarioName, startHits)
			}
			// Polling must have ticked at least once to reach a terminal state.
			if progressHits < 1 {
				t.Errorf("%s: SyncProgress hits = %d, want >= 1", scenarioName, progressHits)
			}
		})
	}
}

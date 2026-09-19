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

// cachePurgeMux dispatches GraphQL requests for the M6 cache purge
// scenarios.
//
// It must answer BOTH CLIs, because these recordings back real Node-vs-Go
// differentials (TestSurfaceDifferentialParity), not just vip-next.
//
// Go operation → file mapping:
//
//	ResolveAppByName / ResolveAppByID -> resolve-app.json
//	PurgePageCache                    -> purge.json
//
// Node operation → file mapping (names verified on the wire against trunk
// 4.1.0, not inferred):
//
//	App                     (src/lib/api/app.ts:46,69)     -> resolve-app.json
//	PurgePageCacheMutation  (src/lib/api/cache-purge.ts:12) -> purge.json
//
// Node's mutation carries a redundant `Mutation` suffix that Go's does not, so
// routing on Go's name alone leaves the real Node CLI talking to the default
// branch and purging nothing.
//
// Missing files fall back to {"data":null}. The mutation hit counter is
// returned so the empty scenario can assert the mutation was NOT called.
func cachePurgeMux(t *testing.T, recordingDir string) (http.Handler, func() int32) {
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
	purgeBody := maybeRead("purge.json")

	nullBody := []byte(`{"data":null}`)
	serve := func(w http.ResponseWriter, body []byte) {
		if body == nil {
			body = nullBody
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}

	var purgeHits int32
	mux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		switch {
		case strings.Contains(s, `"operationName":"ResolveAppByName"`),
			strings.Contains(s, `"operationName":"ResolveAppByID"`),
			strings.Contains(s, `"operationName":"App"`):
			serve(w, resolveAppBody)
		case strings.Contains(s, `"operationName":"PurgePageCache"`),
			strings.Contains(s, `"operationName":"PurgePageCacheMutation"`):
			atomic.AddInt32(&purgeHits, 1)
			serve(w, purgeBody)
		default:
			serve(w, nil)
		}
	})
	hits := func() int32 { return atomic.LoadInt32(&purgeHits) }
	return mux, hits
}

var cachePurgePrefixes = []string{
	"cache-purge-url-",
}

func isCachePurgeScenario(name string) bool {
	for _, p := range cachePurgePrefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

// cachePurgeNoMutationScenarios names the scenarios where the PurgePageCache
// mutation MUST NOT fire (e.g. empty URL list, validated client-side before
// the GraphQL call).
var cachePurgeNoMutationScenarios = map[string]bool{
	"cache-purge-url-empty": true,
}

// TestM6CachePurgeScenarios discovers every YAML matching cache-purge-url-*
// and runs it against cachePurgeMux.
func TestM6CachePurgeScenarios(t *testing.T) {
	yamlDir := "../../testdata/parity"
	entries, err := filepath.Glob(yamlDir + "/*.yaml")
	if err != nil {
		t.Fatalf("glob yaml: %v", err)
	}

	var scenarios []string
	for _, path := range entries {
		base := strings.TrimSuffix(filepath.Base(path), ".yaml")
		if isCachePurgeScenario(base) {
			scenarios = append(scenarios, path)
		}
	}
	if len(scenarios) == 0 {
		t.Fatal("no M6 cache purge scenarios found — testdata may have moved")
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

			mux, hits := cachePurgeMux(t, scenario.Recording)
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

			// Wire-level assertion: no-mutation scenarios MUST NOT fire purge.
			if cachePurgeNoMutationScenarios[scenarioName] {
				if h := hits(); h != 0 {
					t.Errorf("%s: scenario must not call PurgePageCache; got hits=%d", scenarioName, h)
				}
			}
		})
	}
}

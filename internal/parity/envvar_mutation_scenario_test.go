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

// envvarMutationMux dispatches GraphQL requests for the M6 envvar set/delete
// scenarios.
//
// It must answer BOTH CLIs — these recordings back real Node-vs-Go
// differentials (TestSurfaceDifferentialParity), not just vip-next.
//
// Operation → file mapping:
//
//	ResolveAppByName / ResolveAppByID -> resolve-app.json  (Go)
//	App                               -> resolve-app.json  (Node, src/lib/api/app.ts:46)
//	AddEnvironmentVariable            -> add.json          (both)
//	DeleteEnvironmentVariable         -> delete.json       (both)
//
// The two mutation names happen to agree; the app resolution does not.
//
// Node reads `app.organization.id` when it assembles this command's tracking
// params (src/bin/vip-config-envvar-set.js:47, -delete.js likewise), BEFORE the
// command body runs, so a resolve-app.json without an `organization` object
// kills the real Node CLI with "TypeError: Cannot read properties of undefined
// (reading 'id')" and every scenario in the family "diverges" for a reason that
// is purely the fixture's. Keep `organization` present in every recording.
//
// Missing files fall back to {"data":null}. The mutation hit counters are
// returned so cancel-scenarios can assert the mutation was NOT called.
func envvarMutationMux(t *testing.T, recordingDir string) (http.Handler, func() (add, del int32)) {
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
	addBody := maybeRead("add.json")
	deleteBody := maybeRead("delete.json")

	nullBody := []byte(`{"data":null}`)
	serve := func(w http.ResponseWriter, body []byte) {
		if body == nil {
			body = nullBody
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}

	var addHits, delHits int32
	mux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		switch {
		case strings.Contains(s, `"operationName":"ResolveAppByName"`),
			strings.Contains(s, `"operationName":"ResolveAppByID"`),
			strings.Contains(s, `"operationName":"App"`):
			serve(w, resolveAppBody)
		case strings.Contains(s, `"operationName":"AddEnvironmentVariable"`):
			atomic.AddInt32(&addHits, 1)
			serve(w, addBody)
		case strings.Contains(s, `"operationName":"DeleteEnvironmentVariable"`):
			atomic.AddInt32(&delHits, 1)
			serve(w, deleteBody)
		default:
			serve(w, nil)
		}
	})
	hits := func() (int32, int32) {
		return atomic.LoadInt32(&addHits), atomic.LoadInt32(&delHits)
	}
	return mux, hits
}

// envvarMutationPrefixes are YAML name prefixes that identify M6 envvar
// set/delete scenarios. Kept separate from m5Prefixes so we can extend the
// mux independently — the M6 mux understands Add/DeleteEnvironmentVariable
// while the M5 mux does not.
var envvarMutationPrefixes = []string{
	"envvar-set-",
	"envvar-delete-",
}

func isEnvvarMutationScenario(name string) bool {
	for _, p := range envvarMutationPrefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

// envvarCancelScenarios names the scenarios where the mutation MUST NOT
// fire — used as an extra wire-level assertion beyond the exit-code check.
var envvarCancelScenarios = map[string]bool{
	"envvar-set-prod-cancel":       true,
	"envvar-set-newrelic-blocked":  true,
	"envvar-set-invalid-name":      true,
	"envvar-delete-prod-cancel":    true,
	"envvar-delete-typed-mismatch": true,
}

// TestM6EnvvarMutationScenarios discovers every YAML matching
// envvar-set-* / envvar-delete-* and runs it against envvarMutationMux.
func TestM6EnvvarMutationScenarios(t *testing.T) {
	yamlDir := "../../testdata/parity"
	entries, err := filepath.Glob(yamlDir + "/*.yaml")
	if err != nil {
		t.Fatalf("glob yaml: %v", err)
	}

	var scenarios []string
	for _, path := range entries {
		base := strings.TrimSuffix(filepath.Base(path), ".yaml")
		if isEnvvarMutationScenario(base) {
			scenarios = append(scenarios, path)
		}
	}
	if len(scenarios) == 0 {
		t.Fatal("no M6 envvar mutation scenarios found — testdata may have moved")
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

			mux, hits := envvarMutationMux(t, scenario.Recording)
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

			// Wire-level assertion: cancel scenarios MUST NOT fire the mutation.
			if envvarCancelScenarios[scenarioName] {
				add, del := hits()
				if add != 0 || del != 0 {
					t.Errorf("%s: cancel scenario must not call add/delete; got add=%d del=%d", scenarioName, add, del)
				}
			}
		})
	}
}

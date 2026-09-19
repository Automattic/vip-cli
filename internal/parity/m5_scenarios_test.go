//go:build parity

package parity

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// m5Mux returns an HTTP handler that dispatches GraphQL requests to recording
// files by matching the "operationName" field in the request body.
//
// It must answer BOTH CLIs, because these recordings back real Node-vs-Go
// differentials (TestM5DifferentialParity), not just vip-next. The two
// implementations name the same operations differently — Node's queries are
// written inline in src/, Go's are genqlient operations in
// internal/gql/operations/ — so each fixture is reachable under either name.
//
// Go operation → file mapping:
//
//	AppList                              -> apps.json
//	AppGetByName, AppGetByID             -> app.json
//	ResolveAppByName, ResolveAppByID     -> resolve-app.json
//	GetEnvironmentVariables              -> envvars.json
//	GetEnvironmentVariablesWithValues    -> envvars.json
//	GetAppLogs                           -> logs.json
//	GetAppSlowlogs                       -> slowlogs.json
//
// Node operation → file mapping (names verified against trunk 4.1.0):
//
//	Apps  (src/bin/vip-app-list.js:37)   -> apps.json
//	App   (src/lib/api/app.ts:46,69)     -> resolve-app.json, else app.json
//	GetEnvironmentVariables              (src/lib/envvar/api-list.ts:11)
//	GetEnvironmentVariablesWithValues    (src/lib/envvar/api-get-all.ts:11)
//	GetAppLogs                           (src/lib/app-logs/app-logs.ts:10 AND
//	                                      src/lib/app-slowlogs/app-slowlogs.ts:12)
//
// Node issues ONE `App` operation where Go issues two differently-named ones:
// src/lib/api/app.ts serves both the `@app.env` context resolution and
// `vip app <name>`, varying only the requested field set. The recordings keep
// that split (resolve-app.json vs app.json), so `App` prefers resolve-app.json
// and falls back to app.json — which is exactly the file the correspondingly
// named Go operation would have been served.
//
// If a recording file is absent, serves {"data":null} (non-fatal).
func m5Mux(t *testing.T, recordingDir string) http.Handler {
	t.Helper()
	base := "../../testdata/parity/recordings/" + recordingDir + "/"

	maybeRead := func(name string) []byte {
		b, err := os.ReadFile(base + name)
		if err != nil {
			return nil
		}
		return b
	}

	appsBody := maybeRead("apps.json")
	appBody := maybeRead("app.json")
	resolveAppBody := maybeRead("resolve-app.json")
	envvarsBody := maybeRead("envvars.json")
	logsBody := maybeRead("logs.json")
	slowlogsBody := maybeRead("slowlogs.json")

	nullBody := []byte(`{"data":null}`)

	serve := func(w http.ResponseWriter, body []byte) {
		if body == nil {
			body = nullBody
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)

		switch {
		// Node's `Apps` must be matched before its `App`: the trailing quote in
		// the literal already prevents `"App"` from matching `"Apps"`, but
		// keeping the wider name first documents the intent.
		case strings.Contains(s, `"operationName":"AppList"`),
			strings.Contains(s, `"operationName":"Apps"`):
			serve(w, appsBody)
		case strings.Contains(s, `"operationName":"AppGetByName"`),
			strings.Contains(s, `"operationName":"AppGetByID"`):
			serve(w, appBody)
		case strings.Contains(s, `"operationName":"ResolveAppByName"`),
			strings.Contains(s, `"operationName":"ResolveAppByID"`):
			serve(w, resolveAppBody)
		// Node's single `App` operation covers both of the two cases above.
		case strings.Contains(s, `"operationName":"App"`):
			if resolveAppBody != nil {
				serve(w, resolveAppBody)
			} else {
				serve(w, appBody)
			}
		// Order matters: WithValues is checked first because its op-name
		// contains "GetEnvironmentVariables" as a substring. Swapping
		// these cases would silently misroute the values variant.
		case strings.Contains(s, `"operationName":"GetEnvironmentVariablesWithValues"`):
			serve(w, envvarsBody)
		case strings.Contains(s, `"operationName":"GetEnvironmentVariables"`):
			serve(w, envvarsBody)
		case strings.Contains(s, `"operationName":"GetAppSlowlogs"`):
			serve(w, slowlogsBody)
		// Node names its slowlogs query `GetAppLogs` too
		// (src/lib/app-slowlogs/app-slowlogs.ts:12 and
		// src/lib/app-logs/app-logs.ts:10 declare the same operation name), so
		// the operation name alone cannot route Node's two log queries. The
		// selection set is what distinguishes them: slowlogs selects
		// `slowlogs(`, runtime logs select `logs(`.
		case strings.Contains(s, `"operationName":"GetAppLogs"`):
			if strings.Contains(s, "slowlogs(") {
				serve(w, slowlogsBody)
			} else {
				serve(w, logsBody)
			}
		default:
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(nullBody)
		}
	})
}

// m5Prefixes are the YAML name prefixes that identify M5 backlog scenarios.
var m5Prefixes = []string{
	"app-list-",
	"app-get-",
	"envvar-list-",
	"envvar-get-",
	"envvar-getall-",
	"logs-",
	"slowlogs-",
}

func isM5Scenario(name string) bool {
	for _, p := range m5Prefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

// TestM5Scenarios discovers every YAML under testdata/parity/ whose filename
// matches an M5 prefix, starts a mock GraphQL server backed by the scenario's
// recording directory, and asserts the Go binary exits with the expected code.
func TestM5Scenarios(t *testing.T) {
	yamlDir := "../../testdata/parity"
	entries, err := filepath.Glob(yamlDir + "/*.yaml")
	if err != nil {
		t.Fatalf("glob yaml: %v", err)
	}

	var m5 []string
	for _, path := range entries {
		base := strings.TrimSuffix(filepath.Base(path), ".yaml")
		if isM5Scenario(base) {
			m5 = append(m5, path)
		}
	}
	if len(m5) == 0 {
		t.Fatal("no M5 scenarios found — testdata may have moved")
	}

	// Build the binary once for all subtests.
	goBin := buildVipNextWithVersion(t, "test", "test")

	for _, path := range m5 {
		scenarioName := strings.TrimSuffix(filepath.Base(path), ".yaml")

		t.Run(scenarioName, func(t *testing.T) {
			scenario, err := LoadScenario(path)
			if err != nil {
				t.Fatalf("LoadScenario(%s): %v", path, err)
			}

			// A scenario carrying expected_drift asserts NODE's behaviour, which
			// vip-next deliberately does not reproduce, so the exit-code check
			// here would be wrong. Skipping loses nothing: every M5 scenario now
			// also runs as a real Node-vs-Go differential
			// (TestM5DifferentialParity), which compares stdout, stderr AND the
			// exit code and announces the blessed divergence on stderr — that is
			// strictly stronger than this exit-code-only assertion.
			if scenario.ExpectedDrift != nil {
				t.Skipf("expected drift (%s); asserted by TestM5DifferentialParity instead of %s",
					scenario.ExpectedDrift.Reason, scenarioName)
				return
			}

			mux := m5Mux(t, scenario.Recording)
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
				t.Errorf("Run(%s): %v", scenarioName, err)
				return
			}

			if res.ExitCode != scenario.Expect.ExitCode {
				t.Errorf("%s: exit code = %d, want %d\n  stderr: %s\n  stdout: %s",
					scenarioName, res.ExitCode, scenario.Expect.ExitCode,
					res.Stderr, res.Stdout)
			}
		})
	}
}

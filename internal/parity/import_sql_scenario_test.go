//go:build parity

package parity

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync/atomic"
	"testing"
)

// importSQLMux dispatches GraphQL requests for the M7a import-sql
// scenarios. Per-scenario recordings override the shared fixtures
// (import-sql-shared/) file-by-file:
//
//	ResolveAppByName / ResolveAppByID -> resolve-app.json
//	ImportSQLEnvInfo                  -> env-info.json
//	AppMultiSiteCheck                 -> multisite.json
//	ImportSQLProgress                 -> progress.json
//	StartImport                       -> start-import.json (hit-counted;
//	                                     gate/abort scenarios assert 0)
func importSQLMux(t *testing.T, recordingDir string) (http.Handler, func() int32) {
	t.Helper()
	shared := "../../testdata/parity/recordings/import-sql-shared/"
	base := "../../testdata/parity/recordings/" + recordingDir + "/"

	read := func(name string) []byte {
		if b, err := os.ReadFile(base + name); err == nil {
			return b
		}
		if b, err := os.ReadFile(shared + name); err == nil {
			return b
		}
		return nil
	}

	resolveAppBody := read("resolve-app.json")
	envInfoBody := read("env-info.json")
	multisiteBody := read("multisite.json")
	progressBody := read("progress.json")
	startImportBody := read("start-import.json")

	nullBody := []byte(`{"data":null}`)
	serve := func(w http.ResponseWriter, body []byte) {
		if body == nil {
			body = nullBody
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}

	var startImportHits int32
	mux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		switch {
		// `App` is Node's app resolution (src/lib/api/app.ts:46,69). Node's
		// appQuery for this command additionally selects launched,
		// isK8sResident, syncProgress and importStatus — i.e. everything Go
		// fetches in the separate ImportSQLEnvInfo round trip — so
		// resolve-app.json must stay consistent with env-info.json or the two
		// CLIs are answering questions about different worlds and the
		// differential is meaningless.
		case strings.Contains(s, `"operationName":"ResolveAppByName"`),
			strings.Contains(s, `"operationName":"ResolveAppByID"`),
			strings.Contains(s, `"operationName":"App"`):
			serve(w, resolveAppBody)
		case strings.Contains(s, `"operationName":"ImportSQLEnvInfo"`):
			serve(w, envInfoBody)
		case strings.Contains(s, `"operationName":"AppMultiSiteCheck"`):
			serve(w, multisiteBody)
		case strings.Contains(s, `"operationName":"ImportSQLProgress"`):
			serve(w, progressBody)
		case strings.Contains(s, `"operationName":"StartImport"`):
			atomic.AddInt32(&startImportHits, 1)
			serve(w, startImportBody)
		default:
			serve(w, nil)
		}
	})
	return mux, func() int32 { return atomic.LoadInt32(&startImportHits) }
}

// TestM7aImportSQLScenarios discovers every YAML matching import-sql-*
// (excluding the M6b import-validate-sql-* family) and runs the Go
// binary against the stubbed API.
func TestM7aImportSQLScenarios(t *testing.T) {
	yamlDir := "../../testdata/parity"
	entries, err := filepath.Glob(yamlDir + "/import-sql-*.yaml")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	sort.Strings(entries)
	if len(entries) == 0 {
		t.Fatal("no import-sql scenarios found — testdata moved?")
	}

	goBin := buildVipNextWithVersion(t, "test", "test")

	for _, path := range entries {
		name := strings.TrimSuffix(filepath.Base(path), ".yaml")
		t.Run(name, func(t *testing.T) {
			scenario, err := LoadScenario(path)
			if err != nil {
				t.Fatalf("LoadScenario: %v", err)
			}
			if scenario.ExpectedDrift != nil {
				t.Skipf("expected drift (%s); skipping assertion", scenario.ExpectedDrift.Reason)
				return
			}

			mux, startImportHits := importSQLMux(t, scenario.Recording)
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
				t.Fatalf("Run: %v", err)
			}
			if res.ExitCode != scenario.Expect.ExitCode {
				t.Errorf("exit=%d, want %d\n  stderr: %s\n  stdout: %s",
					res.ExitCode, scenario.Expect.ExitCode, res.Stderr, res.Stdout)
			}

			combined := res.Stdout + res.Stderr
			switch name {
			case "import-sql-help":
				for _, flag := range []string{
					"--skip-validate", "--search-replace", "--in-place", "--output",
					"--skip-maintenance-mode", "--md5", "--header", "--skip-backup",
				} {
					if !strings.Contains(combined, flag) {
						t.Errorf("help output missing %s:\n%s", flag, combined)
					}
				}
				if !strings.Contains(combined, "status") {
					t.Errorf("help output missing status subcommand:\n%s", combined)
				}
			case "import-sql-bad-extension":
				if !strings.Contains(combined, "Invalid file extension. Please provide a .sql or .gz file.") {
					t.Errorf("missing extension-gate message:\n%s", combined)
				}
			case "import-sql-invalid-md5":
				if !strings.Contains(combined, "The provided MD5 hash is invalid. It should be a 32-character hexadecimal string.") {
					t.Errorf("missing md5-gate message:\n%s", combined)
				}
			case "import-sql-validation-failure":
				if !strings.Contains(combined, "SQL validation failed due to") ||
					!strings.Contains(combined, "--skip-validate") {
					t.Errorf("missing import-mode validation report:\n%s", combined)
				}
			case "import-sql-in-progress":
				if !strings.Contains(combined, "There is already an import in progress.") ||
					!strings.Contains(combined, "vip import sql status") {
					t.Errorf("missing in-progress gate message:\n%s", combined)
				}
			case "import-sql-noninteractive-abort":
				if !strings.Contains(combined, "The input did not match the expected environment label. Import aborted.") {
					t.Errorf("missing abort message:\n%s", combined)
				}
				// The playbook must have rendered before the prompt.
				if !strings.Contains(combined, "importing:") {
					t.Errorf("missing playbook output:\n%s", combined)
				}
			case "import-sql-status-no-job":
				if !strings.Contains(combined, "No import job found") {
					t.Errorf("missing no-job message:\n%s", combined)
				}
			case "import-sql-status-completed":
				if !strings.Contains(combined, "Success") ||
					!strings.Contains(combined, "Importing db") {
					t.Errorf("missing completed status block:\n%s", combined)
				}
			}

			// No scenario in this family may fire StartImport — they all
			// abort at a gate, a prompt, or are read-only status checks.
			if hits := startImportHits(); hits != 0 {
				t.Errorf("StartImport fired %d times, want 0", hits)
			}
		})
	}
}

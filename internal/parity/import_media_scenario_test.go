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

// importMediaMux dispatches GraphQL requests for the M7b media-import +
// validate-files scenarios. Per-scenario recordings override the shared
// fixtures (import-media-shared/) file-by-file:
//
//	ResolveAppByName / ResolveAppByID -> resolve-app.json
//	ImportSQLEnvInfo                  -> env-info.json (banner domain)
//	StartMediaImport                  -> start-media-import.json (counted)
//	AbortMediaImport                  -> abort-media-import.json (counted)
//	MediaImportProgress               -> progress.json
//	MediaImportConfig                 -> config.json
func importMediaMux(t *testing.T, recordingDir string) (http.Handler, func() (start, abort int32)) {
	t.Helper()
	shared := "../../testdata/parity/recordings/import-media-shared/"
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
	startBody := read("start-media-import.json")
	abortBody := read("abort-media-import.json")
	progressBody := read("progress.json")
	configBody := read("config.json")

	nullBody := []byte(`{"data":null}`)
	serve := func(w http.ResponseWriter, body []byte) {
		if body == nil {
			body = nullBody
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}

	var startHits, abortHits int32
	mux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		switch {
		// `App` is Node's app resolution (src/lib/api/app.ts:46,69). Node folds
		// the environment detail Go fetches separately (ImportSQLEnvInfo) into
		// this one query, so resolve-app.json has to carry those fields too.
		case strings.Contains(s, `"operationName":"ResolveAppByName"`),
			strings.Contains(s, `"operationName":"ResolveAppByID"`),
			strings.Contains(s, `"operationName":"App"`):
			serve(w, resolveAppBody)
		case strings.Contains(s, `"operationName":"ImportSQLEnvInfo"`):
			serve(w, envInfoBody)
		case strings.Contains(s, `"operationName":"StartMediaImport"`):
			atomic.AddInt32(&startHits, 1)
			serve(w, startBody)
		case strings.Contains(s, `"operationName":"AbortMediaImport"`):
			atomic.AddInt32(&abortHits, 1)
			serve(w, abortBody)
		case strings.Contains(s, `"operationName":"MediaImportProgress"`):
			serve(w, progressBody)
		case strings.Contains(s, `"operationName":"MediaImportConfig"`):
			serve(w, configBody)
		default:
			serve(w, nil)
		}
	})
	hits := func() (int32, int32) {
		return atomic.LoadInt32(&startHits), atomic.LoadInt32(&abortHits)
	}
	return mux, hits
}

// TestM7bImportMediaScenarios discovers every YAML matching
// import-media-* and import-validate-files-* and runs the Go binary
// against the stubbed API.
func TestM7bImportMediaScenarios(t *testing.T) {
	yamlDir := "../../testdata/parity"
	mediaEntries, err := filepath.Glob(yamlDir + "/import-media-*.yaml")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	vfEntries, err := filepath.Glob(yamlDir + "/import-validate-files-*.yaml")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	entries := append(mediaEntries, vfEntries...)
	sort.Strings(entries)
	if len(entries) == 0 {
		t.Fatal("no import-media scenarios found — testdata moved?")
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

			mux, hits := importMediaMux(t, scenario.Recording)
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
			startHits, abortHits := hits()
			switch name {
			case "import-media-help":
				for _, flag := range []string{
					"--exportFileErrorsToJson", "--saveErrorLog",
					"--overwriteExistingFiles", "--importIntermediateImages",
				} {
					if !strings.Contains(combined, flag) {
						t.Errorf("help missing %s:\n%s", flag, combined)
					}
				}
				if !strings.Contains(combined, "status") || !strings.Contains(combined, "abort") {
					t.Errorf("help missing subcommands:\n%s", combined)
				}
			case "import-media-invalid-archive":
				if !strings.Contains(combined, "Invalid local archive provided:") ||
					!strings.Contains(combined, ".tar.gz, .tgz, .zip") {
					t.Errorf("missing invalid-archive block:\n%s", combined)
				}
				if startHits != 0 {
					t.Errorf("StartMediaImport fired %d times, want 0", startHits)
				}
			case "import-media-url-completed":
				if !strings.Contains(combined, "Importing archive from: https://example.com/uploads.zip") {
					t.Errorf("missing banner:\n%s", combined)
				}
				if startHits != 1 {
					t.Errorf("StartMediaImport fired %d times, want 1", startHits)
				}
			case "import-media-status-completed":
				if !strings.Contains(combined, "COMPLETED") {
					t.Errorf("missing COMPLETED status:\n%s", combined)
				}
			case "import-media-status-failed":
				if !strings.Contains(combined, "Import failed at status: ") ||
					!strings.Contains(combined, "RUNNING") ||
					!strings.Contains(combined, "disk full") {
					t.Errorf("missing failure block:\n%s", combined)
				}
			case "import-media-abort-noninteractive":
				if abortHits != 0 {
					t.Errorf("AbortMediaImport fired %d times, want 0 (declined confirm)", abortHits)
				}
			case "import-validate-files-not-dir":
				if !strings.Contains(combined, "The given path is not a directory. Provide a valid directory path.") {
					t.Errorf("missing not-a-directory error:\n%s", combined)
				}
			case "import-validate-files-clean":
				if !strings.Contains(combined, "PASS") ||
					!strings.Contains(combined, "2 files total") {
					t.Errorf("missing summary:\n%s", combined)
				}
				if strings.Contains(combined, "ERROR") {
					t.Errorf("clean fixture produced ERROR badges:\n%s", combined)
				}
			}
		})
	}
}

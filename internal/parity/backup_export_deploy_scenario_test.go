//go:build parity

package parity

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
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

// m7cMux dispatches the backup/export/deploy GraphQL operations plus the
// presign + S3 endpoints. Per-scenario recordings fall back to
// m7c-shared/ file-by-file. Sequenced fixtures use numeric suffixes
// (backup-status-1.json, backup-status-2.json, ...).
func m7cMux(t *testing.T, recordingDir string) (http.Handler, func(op string) int32) {
	t.Helper()
	shared := "../../testdata/parity/recordings/m7c-shared/"
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
	readSeq := func(prefix string, n int32) []byte {
		// Clamp to the last existing fixture.
		for i := n; i >= 1; i-- {
			if b := read(fmt.Sprintf("%s-%d.json", prefix, i)); b != nil {
				return b
			}
		}
		return nil
	}

	nullBody := []byte(`{"data":null}`)
	serve := func(w http.ResponseWriter, body []byte) {
		if body == nil {
			body = nullBody
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}

	hits := map[string]*int32{
		"TriggerDatabaseBackup": new(int32),
		"BackupDBCopy":          new(int32),
		"StartCustomDeploy":     new(int32),
		"backupStatus":          new(int32),
		"exportStatus":          new(int32),
	}

	var srvURL atomic.Value
	mux := http.NewServeMux()
	mux.HandleFunc("/graphql", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		switch {
		// `App` is Node's name for Go's ResolveAppByName/ByID
		// (src/lib/api/app.ts:46,69).
		case strings.Contains(s, `"operationName":"ResolveAppByName"`),
			strings.Contains(s, `"operationName":"ResolveAppByID"`),
			strings.Contains(s, `"operationName":"App"`):
			serve(w, read("resolve-app.json"))
		case strings.Contains(s, `"operationName":"AppBackupJobStatus"`):
			n := atomic.AddInt32(hits["backupStatus"], 1)
			serve(w, readSeq("backup-status", n))
		case strings.Contains(s, `"operationName":"AppBackupAndJobStatus"`):
			n := atomic.AddInt32(hits["exportStatus"], 1)
			serve(w, readSeq("export-status", n))
		case strings.Contains(s, `"operationName":"TriggerDatabaseBackup"`):
			atomic.AddInt32(hits["TriggerDatabaseBackup"], 1)
			serve(w, []byte(`{"data":{"triggerDatabaseBackup":{"success":true}}}`))
		case strings.Contains(s, `"operationName":"BackupDBCopy"`):
			atomic.AddInt32(hits["BackupDBCopy"], 1)
			serve(w, []byte(`{"data":{"startDBBackupCopy":{"message":"ok","success":true}}}`))
		case strings.Contains(s, `"operationName":"GenerateDBBackupCopyUrl"`):
			u, _ := srvURL.Load().(string)
			serve(w, []byte(`{"data":{"generateDBBackupCopyUrl":{"url":"`+u+`/download","success":true}}}`))
		case strings.Contains(s, `"operationName":"ValidateCustomDeployAccess"`):
			serve(w, []byte(`{"data":{"validateCustomDeployAccess":{"success":true,"appId":42,"envId":7,"envType":"develop","envUniqueLabel":"develop","primaryDomainName":"example.com","launched":false}}}`))
		case strings.Contains(s, `"operationName":"StartCustomDeploy"`):
			atomic.AddInt32(hits["StartCustomDeploy"], 1)
			serve(w, []byte(`{"data":{"startCustomDeploy":{"success":true,"message":"queued"}}}`))
		default:
			serve(w, nil)
		}
	})
	mux.HandleFunc("/upload/site-import-presigned-url", func(w http.ResponseWriter, r *http.Request) {
		u, _ := srvURL.Load().(string)
		fmt.Fprintf(w, `{"url":"%s/s3target","options":{"method":"PUT","headers":{}}}`, u)
	})
	mux.HandleFunc("/s3target", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/download", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("sql-archive-bytes"))
	})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if srvURL.Load() == nil {
			srvURL.Store("http://" + r.Host)
		}
		mux.ServeHTTP(w, r)
	})
	get := func(op string) int32 {
		if p, ok := hits[op]; ok {
			return atomic.LoadInt32(p)
		}
		return 0
	}
	return handler, get
}

// writeDeployFixtures creates the archive fixtures the deploy scenarios
// reference (generated, not committed binaries).
func writeDeployFixtures(t *testing.T) {
	t.Helper()
	dir := "../../testdata/parity/recordings/app-deploy-validate"
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(name string, dirs []string, files []string) {
		p := filepath.Join(dir, name)
		f, err := os.Create(p)
		if err != nil {
			t.Fatal(err)
		}
		zw := gzip.NewWriter(f)
		tw := tar.NewWriter(zw)
		for _, d := range dirs {
			if err := tw.WriteHeader(&tar.Header{Name: d, Typeflag: tar.TypeDir, Mode: 0o755}); err != nil {
				t.Fatal(err)
			}
		}
		for _, fl := range files {
			if err := tw.WriteHeader(&tar.Header{Name: fl, Typeflag: tar.TypeReg, Mode: 0o644, Size: 1}); err != nil {
				t.Fatal(err)
			}
			_, _ = tw.Write([]byte("x"))
		}
		if err := tw.Close(); err != nil {
			t.Fatal(err)
		}
		if err := zw.Close(); err != nil {
			t.Fatal(err)
		}
		if err := f.Close(); err != nil {
			t.Fatal(err)
		}
	}
	write("clean.tar.gz", []string{"app/", "app/themes/"}, []string{"app/themes/style.css"})
	write("no-themes.tar.gz", []string{"app/"}, []string{"app/x.php"})
}

// TestM7cScenarios discovers the backup-db-*, export-sql-*, and
// app-deploy-* YAMLs and runs the Go binary against the stubbed API.
func TestM7cScenarios(t *testing.T) {
	yamlDir := "../../testdata/parity"
	var entries []string
	for _, glob := range []string{"backup-db-*.yaml", "export-sql-*.yaml", "app-deploy-*.yaml"} {
		matches, err := filepath.Glob(yamlDir + "/" + glob)
		if err != nil {
			t.Fatalf("glob: %v", err)
		}
		entries = append(entries, matches...)
	}
	sort.Strings(entries)
	if len(entries) == 0 {
		t.Fatal("no M7c scenarios found — testdata moved?")
	}

	writeDeployFixtures(t)
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

			handler, opHits := m7cMux(t, scenario.Recording)
			srv := httptest.NewServer(handler)
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
			case "backup-db-help":
				if !strings.Contains(combined, "backup") {
					t.Errorf("help output:\n%s", combined)
				}
			case "backup-db-completed":
				if !strings.Contains(combined, "Generating a new database backup...") ||
					!strings.Contains(combined, "New database backup created") {
					t.Errorf("missing backup logs:\n%s", combined)
				}
				if opHits("TriggerDatabaseBackup") != 1 {
					t.Errorf("Trigger hits = %d, want 1", opHits("TriggerDatabaseBackup"))
				}
			case "backup-db-already-in-progress":
				if !strings.Contains(combined, "Database backup already in progress...") {
					t.Errorf("missing in-progress log:\n%s", combined)
				}
				if opHits("TriggerDatabaseBackup") != 0 {
					t.Errorf("Trigger hits = %d, want 0", opHits("TriggerDatabaseBackup"))
				}
			case "export-sql-help":
				for _, flag := range []string{"--output", "--table", "--site-id", "--wpcli-command", "--config-file", "--generate-backup", "--skip-download"} {
					if !strings.Contains(combined, flag) {
						t.Errorf("help missing %s:\n%s", flag, combined)
					}
				}
			case "export-sql-completed":
				if opHits("BackupDBCopy") != 1 {
					t.Errorf("BackupDBCopy hits = %d, want 1", opHits("BackupDBCopy"))
				}
				if !strings.Contains(combined, "Exporting database backup with timestamp 2026-06-11 10:00:00") {
					t.Errorf("missing prepare info:\n%s", combined)
				}
			case "export-sql-config-conflict":
				if !strings.Contains(combined, "The --config-file option cannot be used with the --table, --site-id, or --wpcli-command options.") {
					t.Errorf("missing exclusivity message:\n%s", combined)
				}
			case "app-deploy-missing-token":
				if !strings.Contains(combined, "Valid custom deploy key is required.") {
					t.Errorf("missing token message:\n%s", combined)
				}
			case "app-deploy-completed":
				if opHits("StartCustomDeploy") != 1 {
					t.Errorf("StartCustomDeploy hits = %d, want 1", opHits("StartCustomDeploy"))
				}
				if !strings.Contains(combined, "has been sent for deployment to example.com.") ||
					!strings.Contains(combined, "https://dashboard.wpvip.com/apps/42/develop/code/deployments") {
					t.Errorf("missing success block:\n%s", combined)
				}
			case "app-deploy-validate-clean":
				if !strings.Contains(combined, "✓ Compressed file has been successfully validated with no errors.") {
					t.Errorf("missing success line:\n%s", combined)
				}
			case "app-deploy-validate-missing-themes":
				if !strings.Contains(combined, "Missing `themes` directory from root folder.") {
					t.Errorf("missing themes error:\n%s", combined)
				}
			}
		})
	}
}

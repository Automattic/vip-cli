package commands

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	json "encoding/json/v2"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/sqlexport"
)

// exportStub serves AppBackupAndJobStatus (sequenced), the copy/link
// mutations, and a download target.
type exportStub struct {
	statusBodies []string
	statusHits   atomic.Int32
	copyHits     atomic.Int32
	linkHits     atomic.Int32
	downloadBody string
	srvURL       string
}

func exportStatusBody(withJob bool, preflight, uploadBackup string) string {
	jobs := "[]"
	if withJob {
		jobs = `[{"__typename":"Job","id":5,"type":"db_backup_copy","completedAt":null,"createdAt":"2026-06-11 10:05:00",
			"inProgressLock":false,
			"metadata":[{"name":"backupId","value":"11"},{"name":"bytesWritten","value":"2048"},{"name":"uploadPath","value":"exports/file.sql.gz"}],
			"progress":{"status":"running","steps":[
				{"id":"preflight","name":"Preflight","step":"preflight","status":"` + preflight + `"},
				{"id":"upload_backup","name":"Upload","step":"upload_backup","status":"` + uploadBackup + `"}]}}]`
	}
	return `{"data":{"app":{"id":42,"environments":[{"id":7,"backupsSqlDumpTool":"mysqldump",
		"latestBackup":{"id":11,"type":"daily","size":1024,"filename":"backup.sql.gz","sqlDumpTool":"mysqldump","createdAt":"2026-06-11 10:00:00"},
		"jobs":` + jobs + `}]}}}`
}

func (s *exportStub) start(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	s.srvURL = srv.URL

	mux.HandleFunc("/graphql", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bs := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(bs, `"operationName":"AppBackupAndJobStatus"`):
			i := int(s.statusHits.Add(1) - 1)
			if i >= len(s.statusBodies) {
				i = len(s.statusBodies) - 1
			}
			_, _ = w.Write([]byte(s.statusBodies[i]))
		case strings.Contains(bs, `"operationName":"BackupDBCopy"`):
			s.copyHits.Add(1)
			_, _ = w.Write([]byte(`{"data":{"startDBBackupCopy":{"message":"ok","success":true}}}`))
		case strings.Contains(bs, `"operationName":"GenerateDBBackupCopyUrl"`):
			s.linkHits.Add(1)
			fmt.Fprintf(w, `{"data":{"generateDBBackupCopyUrl":{"url":"%s/download","success":true}}}`, s.srvURL)
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	})
	mux.HandleFunc("/download", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Length", strconv.Itoa(len(s.downloadBody)))
		_, _ = w.Write([]byte(s.downloadBody))
	})
	return srv
}

func setupExportTest(t *testing.T, stub *exportStub) {
	t.Helper()
	srv := stub.start(t)
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()), APIHost: srv.URL, Token: "tok"})
	t.Cleanup(func() { SetConfig(Config{}) })
	t.Setenv("NO_COLOR", "1")
	t.Setenv("VIP_EXPORT_SQL_INTERVAL_MS", "1")
}

// TestExportPollTimeoutKnob: `vip export sql` inherits Node's 6h pollUntil
// ceiling (export-sql.ts:547,555 pass no timeout), overridable with the same
// VIP_*_MS knob shape as VIP_EXPORT_SQL_INTERVAL_MS.
func TestExportPollTimeoutKnob(t *testing.T) {
	if got := exportPollTimeout(); got != sqlexport.DefaultPollTimeout {
		t.Errorf("exportPollTimeout() = %v, want %v", got, sqlexport.DefaultPollTimeout)
	}
	t.Setenv("VIP_EXPORT_SQL_TIMEOUT_MS", "25")
	if got := exportPollTimeout(); got != 25*time.Millisecond {
		t.Errorf("with VIP_EXPORT_SQL_TIMEOUT_MS=25: %v, want 25ms", got)
	}
}

// TestExportSQLStopsAtPollCeiling drives the whole command against an export
// job whose preflight step never succeeds. Before the ceiling was ported this
// spun forever with nothing cancelling the context.
func TestExportSQLStopsAtPollCeiling(t *testing.T) {
	stub := &exportStub{
		statusBodies: []string{exportStatusBody(true, "running", "running")},
		downloadBody: "unused",
	}
	setupExportTest(t, stub)
	t.Setenv("VIP_EXPORT_SQL_TIMEOUT_MS", "30")
	restore := stubImportPrompts("unused", true)
	defer restore()

	cmd := ExportSQLCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	done := make(chan error, 1)
	go func() { done <- runExportSQL(cmd, nil) }()
	select {
	case err := <-done:
		if err == nil || !strings.Contains(err.Error(), "Polling timed out") {
			t.Errorf("err = %v, want a %q failure", err, "Polling timed out")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("runExportSQL never returned: the poll loop is unbounded")
	}
}

func TestExportSQLHappyPath(t *testing.T) {
	stub := &exportStub{
		statusBodies: []string{
			exportStatusBody(false, "", ""),              // initial: no job → CreateExport
			exportStatusBody(true, "success", "running"), // preflight done
			exportStatusBody(true, "success", "success"), // upload done
		},
		downloadBody: "sql-archive-bytes",
	}
	setupExportTest(t, stub)
	restore := stubImportPrompts("unused", true)
	defer restore()

	outPath := filepath.Join(t.TempDir(), "export.sql.gz")
	cmd := ExportSQLCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))
	_ = cmd.Flags().Set("output", outPath)

	if err := runExportSQL(cmd, nil); err != nil {
		t.Fatalf("runExportSQL: %v\nstdout: %s", err, stdout.String())
	}
	if stub.copyHits.Load() != 1 || stub.linkHits.Load() != 1 {
		t.Errorf("copy=%d link=%d", stub.copyHits.Load(), stub.linkHits.Load())
	}
	got, err := os.ReadFile(outPath) // #nosec G304
	if err != nil || string(got) != "sql-archive-bytes" {
		t.Errorf("downloaded = %q err=%v", got, err)
	}
	if !strings.Contains(stdout.String(), "File saved to "+outPath) {
		t.Errorf("stdout = %q", stdout.String())
	}
}

func TestExportSQLSkipDownload(t *testing.T) {
	stub := &exportStub{
		statusBodies: []string{exportStatusBody(true, "success", "success")},
		downloadBody: "x",
	}
	setupExportTest(t, stub)

	cmd := ExportSQLCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))
	_ = cmd.Flags().Set("skip-download", "true")

	if err := runExportSQL(cmd, nil); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stdout.String(), "File saved to") {
		t.Errorf("skip-download must not save: %q", stdout.String())
	}
	// Attaching message since the job already exists.
	if stub.copyHits.Load() != 0 {
		t.Error("BackupDBCopy must not fire when a matching export job exists")
	}
}

func TestExportSQLConfigFileConflict(t *testing.T) {
	stub := &exportStub{statusBodies: []string{exportStatusBody(false, "", "")}}
	setupExportTest(t, stub)

	cmd := ExportSQLCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))
	_ = cmd.Flags().Set("config-file", "cfg.json")
	_ = cmd.Flags().Set("table", "wp_posts")

	err := runExportSQL(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "The --config-file option cannot be used with the --table, --site-id, or --wpcli-command options.") {
		t.Errorf("err = %v", err)
	}
}

// TestExportSQLConfigFileReachesTheWireIntact is the end-to-end half of
// register 2.18. The unit tests prove BuildConfig keeps every key; this one
// proves the plumbing between BuildConfig and
// LiveBackupCopyConfigInput.config doesn't re-narrow it. If any key is lost
// here the user gets a dump with the wrong scope AND exit 0 — nothing in the
// output signals it, which is what makes this the highest-severity item in
// the slice.
func TestExportSQLConfigFileReachesTheWireIntact(t *testing.T) {
	configJSON := `{
		"type": "tables",
		"tool": "mysqldump",
		"tables": {"wp_posts": {"where": "ID > 100", "structure_only": true}},
		"exclude_tables": ["wp_options"],
		"limit": 500,
		"site_ids": []
	}`
	cfgPath := filepath.Join(t.TempDir(), "db-export-config.json")
	if err := os.WriteFile(cfgPath, []byte(configJSON), 0o600); err != nil {
		t.Fatal(err)
	}

	var sentConfig map[string]any
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	defer srv.Close()
	mux.HandleFunc("/graphql", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(string(body), `"operationName":"StartLiveBackupCopy"`):
			var req struct {
				Variables struct {
					Input struct {
						Config map[string]any `json:"config"`
					} `json:"input"`
				} `json:"variables"`
			}
			if err := json.Unmarshal(body, &req); err != nil {
				t.Errorf("decode request: %v", err)
			}
			sentConfig = req.Variables.Input.Config
			_, _ = w.Write([]byte(`{"data":{"startLiveBackupCopy":{"message":"ok","copyId":"copy-9"}}}`))
		case strings.Contains(string(body), `"operationName":"GenerateLiveBackupCopyDownloadURL"`):
			fmt.Fprintf(w, `{"data":{"generateLiveBackupCopyDownloadURL":{"success":true,"url":"%s/download","processing":false,"size":17}}}`, srv.URL)
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	})
	mux.HandleFunc("/download", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("sql-archive-bytes"))
	})

	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()), APIHost: srv.URL, Token: "tok"})
	t.Cleanup(func() { SetConfig(Config{}) })
	t.Setenv("NO_COLOR", "1")
	t.Setenv("VIP_EXPORT_SQL_INTERVAL_MS", "1")
	restore := stubImportPrompts("unused", true)
	defer restore()

	dest := filepath.Join(t.TempDir(), "out.sql.gz")
	cmd := ExportSQLCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))
	_ = cmd.Flags().Set("config-file", cfgPath)
	_ = cmd.Flags().Set("output", dest)

	if err := runExportSQL(cmd, nil); err != nil {
		t.Fatalf("runExportSQL: %v", err)
	}
	if sentConfig == nil {
		t.Fatal("StartLiveBackupCopy was never called")
	}

	if _, ok := sentConfig["exclude_tables"]; !ok {
		t.Errorf("exclude_tables never reached the server: %v", sentConfig)
	}
	if sentConfig["limit"] != float64(500) {
		t.Errorf("limit never reached the server: %v", sentConfig)
	}
	if _, ok := sentConfig["site_ids"]; !ok {
		t.Errorf("explicit empty site_ids never reached the server: %v", sentConfig)
	}
	tables, _ := sentConfig["tables"].(map[string]any)
	wpPosts, _ := tables["wp_posts"].(map[string]any)
	if wpPosts["where"] != "ID > 100" || wpPosts["structure_only"] != true {
		t.Errorf("per-table options never reached the server: %v", sentConfig)
	}
}

func TestExportSQLNoBackup(t *testing.T) {
	stub := &exportStub{statusBodies: []string{
		`{"data":{"app":{"id":42,"environments":[{"id":7,"backupsSqlDumpTool":null,"latestBackup":null,"jobs":[]}]}}}`,
	}}
	setupExportTest(t, stub)

	cmd := ExportSQLCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	err := runExportSQL(cmd, nil)
	if err == nil || err.Error() != "No backup found for site parityapp" {
		t.Errorf("err = %v", err)
	}
}

package commands

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/backup"
)

// backupStub serves AppBackupJobStatus (sequenced) + TriggerDatabaseBackup.
type backupStub struct {
	statusBodies []string
	statusHits   atomic.Int32
	triggerHits  atomic.Int32
}

func backupJobBody(lock bool, status string) string {
	return `{"data":{"app":{"id":42,"environments":[{"id":7,"jobs":[
		{"__typename":"Job","id":1,"type":"db_backup","completedAt":"2026-06-11 10:00:00","createdAt":"2026-06-11 09:00:00",
		 "inProgressLock":` + boolStr(lock) + `,
		 "metadata":[{"name":"backupName","value":"backup-1"}],
		 "progress":{"status":"` + status + `"}}]}]}}}`
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func (s *backupStub) start(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bs := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(bs, `"operationName":"AppBackupJobStatus"`):
			i := int(s.statusHits.Add(1) - 1)
			if i >= len(s.statusBodies) {
				i = len(s.statusBodies) - 1
			}
			_, _ = w.Write([]byte(s.statusBodies[i]))
		case strings.Contains(bs, `"operationName":"TriggerDatabaseBackup"`):
			s.triggerHits.Add(1)
			_, _ = w.Write([]byte(`{"data":{"triggerDatabaseBackup":{"success":true}}}`))
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func setupBackupTest(t *testing.T, stub *backupStub) {
	t.Helper()
	srv := stub.start(t)
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()), APIHost: srv.URL, Token: "tok"})
	t.Cleanup(func() { SetConfig(Config{}) })
	t.Setenv("NO_COLOR", "1")
	t.Setenv("VIP_BACKUP_DB_INTERVAL_MS", "1")
}

// TestBackupPollTimeoutKnob: `vip backup db` inherits Node's 6h pollUntil
// ceiling (backup-db.ts:198 passes no timeout), and the ceiling is
// overridable with the same VIP_*_MS knob shape as the interval so it can
// be exercised without a six-hour test.
func TestBackupPollTimeoutKnob(t *testing.T) {
	if got := backupPollTimeout(); got != backup.DefaultPollTimeout {
		t.Errorf("backupPollTimeout() = %v, want %v", got, backup.DefaultPollTimeout)
	}
	t.Setenv("VIP_BACKUP_DB_TIMEOUT_MS", "25")
	if got := backupPollTimeout(); got != 25*time.Millisecond {
		t.Errorf("with VIP_BACKUP_DB_TIMEOUT_MS=25: %v, want 25ms", got)
	}
}

// TestBackupDBStopsAtPollCeiling drives the whole command against a backup
// job whose inProgressLock never clears. Before the ceiling was ported this
// spun forever with nothing cancelling the context.
func TestBackupDBStopsAtPollCeiling(t *testing.T) {
	stub := &backupStub{statusBodies: []string{backupJobBody(true, "running")}}
	setupBackupTest(t, stub)
	t.Setenv("VIP_BACKUP_DB_TIMEOUT_MS", "30")

	cmd := BackupDBCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	done := make(chan error, 1)
	go func() { done <- runBackupDB(cmd, nil) }()
	select {
	case err := <-done:
		if err == nil || !strings.Contains(err.Error(), "Polling timed out") {
			t.Errorf("err = %v, want a %q failure", err, "Polling timed out")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("runBackupDB never returned: the poll loop is unbounded")
	}
}

func TestBackupDBHappyPath(t *testing.T) {
	stub := &backupStub{statusBodies: []string{
		`{"data":{"app":{"id":42,"environments":[{"id":7,"jobs":[]}]}}}`, // no job yet
		backupJobBody(true, "running"),
		backupJobBody(false, "success"),
	}}
	setupBackupTest(t, stub)

	cmd := BackupDBCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	if err := runBackupDB(cmd, nil); err != nil {
		t.Fatalf("runBackupDB: %v\nstdout: %s", err, stdout.String())
	}
	out := stdout.String()
	if !strings.Contains(out, "Generating a new database backup...") ||
		!strings.Contains(out, "New database backup created") {
		t.Errorf("stdout = %q", out)
	}
	if stub.triggerHits.Load() != 1 {
		t.Errorf("TriggerDatabaseBackup hits = %d", stub.triggerHits.Load())
	}
}

func TestBackupDBAlreadyInProgress(t *testing.T) {
	stub := &backupStub{statusBodies: []string{
		backupJobBody(true, "running"),
		backupJobBody(false, "success"),
	}}
	setupBackupTest(t, stub)

	cmd := BackupDBCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	if err := runBackupDB(cmd, nil); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(stdout.String(), "Database backup already in progress...") {
		t.Errorf("stdout = %q", stdout.String())
	}
	finalStep := strings.Index(stdout.String(), "✓ Generating backup")
	successMessage := strings.Index(stdout.String(), "New database backup created")
	if finalStep == -1 || successMessage == -1 || finalStep > successMessage {
		t.Errorf("final progress frame must precede the success message; stdout = %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "✓ Generating backup \nNew database backup created\n") {
		t.Errorf("success message must immediately follow the final progress frame; stdout = %q", stdout.String())
	}
	if stub.triggerHits.Load() != 0 {
		t.Error("Trigger must not fire when a backup is already running")
	}
}

func TestBackupDBFinalFailure(t *testing.T) {
	stub := &backupStub{statusBodies: []string{
		`{"data":{"app":{"id":42,"environments":[{"id":7,"jobs":[]}]}}}`,
		backupJobBody(false, "failed"),
	}}
	setupBackupTest(t, stub)

	cmd := BackupDBCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	err := runBackupDB(cmd, nil)
	if err == nil || err.Error() != "Failed to create a new database backup" {
		t.Errorf("err = %v", err)
	}
}

package sqlexport

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/tui"
)

func exportTracker() *tui.ProgressTracker { return tui.NewProgressTracker(Steps()) }

// happyDeps builds Deps for a standard (non-live) flow that completes.
func happyDeps(t *testing.T, downloadBody string) (Deps, *[]string) {
	t.Helper()
	var calls []string
	fetchCount := 0
	deps := Deps{
		FetchStatus: func(ctx context.Context) (*BackupAndJobs, error) {
			fetchCount++
			job := ExportJob{
				BackupID:     11,
				BytesWritten: "2048",
				StepStatus:   map[string]string{},
			}
			// First fetch: no job yet (so CreateExport fires); later
			// fetches: steps progress to success.
			switch {
			case fetchCount == 1:
				return &BackupAndJobs{
					LatestBackup: &Backup{ID: 11, CreatedAt: "2026-06-11 10:00:00"},
				}, nil
			case fetchCount <= 3:
				job.StepStatus["preflight"] = "success"
			default:
				job.StepStatus["preflight"] = "success"
				job.StepStatus["upload_backup"] = "success"
			}
			return &BackupAndJobs{
				LatestBackup: &Backup{ID: 11, CreatedAt: "2026-06-11 10:00:00"},
				Jobs:         []ExportJob{job},
			}, nil
		},
		CreateExport: func(ctx context.Context, backupID int64) error {
			calls = append(calls, "create")
			return nil
		},
		GenerateLink: func(ctx context.Context, backupID int64) (string, error) {
			calls = append(calls, "link")
			return "https://dl.example/backup.sql.gz", nil
		},
		RunBackup: func(ctx context.Context) error { calls = append(calls, "backup"); return nil },
		Confirm:   func(string) (bool, error) { return true, nil },
		FreeBytes: func() (int64, error) { return 1 << 40, nil },
		Download: func(ctx context.Context, url, dest string, onProgress OnProgress) error {
			calls = append(calls, "download:"+url+"->"+dest)
			if onProgress != nil {
				onProgress(1024, 2048)
				onProgress(2048, 2048)
			}
			return nil
		},
	}
	_ = downloadBody
	return deps, &calls
}

func TestExportRunHappyPath(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	deps, calls := happyDeps(t, "data")
	var out bytes.Buffer
	tr := exportTracker()
	saved, err := Run(context.Background(), tr, Options{
		AppID: 42, AppName: "parityapp", EnvUniqueLabel: "develop", Interval: time.Millisecond,
	}, deps, &out)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(*calls, "|")
	if !strings.Contains(joined, "create") || !strings.Contains(joined, "link") ||
		!strings.Contains(joined, "download:https://dl.example/backup.sql.gz->exported.sql.gz") {
		t.Errorf("calls = %v", *calls)
	}
	// Run returns the saved path; the caller (not Run) prints "File saved to",
	// after stopping its progress renderer.
	if saved != "exported.sql.gz" {
		t.Errorf("saved = %q, want exported.sql.gz", saved)
	}
	if strings.Contains(out.String(), "File saved to") {
		t.Errorf("Run must not print 'File saved to'; out = %q", out.String())
	}
	if !strings.Contains(tr.Frame(), "Exporting database backup with timestamp 2026-06-11 10:00:00") {
		t.Errorf("frame missing prepare info: %q", tr.Frame())
	}
}

func TestExportRunNoBackup(t *testing.T) {
	deps, _ := happyDeps(t, "")
	deps.FetchStatus = func(ctx context.Context) (*BackupAndJobs, error) {
		return &BackupAndJobs{}, nil
	}
	_, err := Run(context.Background(), exportTracker(), Options{
		AppName: "parityapp", Interval: time.Millisecond,
	}, deps, &bytes.Buffer{})
	if err == nil || err.Error() != "No backup found for site parityapp" {
		t.Errorf("err = %v", err)
	}
}

func TestExportRunAlreadyInProgress(t *testing.T) {
	deps, _ := happyDeps(t, "")
	deps.CreateExport = func(ctx context.Context, backupID int64) error {
		return errors.New("GraphQL: Backup Copy already in progress")
	}
	_, err := Run(context.Background(), exportTracker(), Options{
		AppID: 42, AppName: "parityapp", EnvUniqueLabel: "develop", Interval: time.Millisecond,
	}, deps, &bytes.Buffer{})
	want := "There is an export job already running for this environment: https://dashboard.wpvip.com/apps/42/develop/database/backups"
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Errorf("err = %v", err)
	}
}

func TestExportRunSkipDownload(t *testing.T) {
	deps, calls := happyDeps(t, "")
	var out bytes.Buffer
	saved, err := Run(context.Background(), exportTracker(), Options{
		AppID: 42, AppName: "parityapp", SkipDownload: true, Interval: time.Millisecond,
	}, deps, &out)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.Join(*calls, "|"), "download:") {
		t.Error("skip-download must not download")
	}
	if saved != "" {
		t.Errorf("skip-download must save nothing; saved = %q", saved)
	}
	if strings.Contains(out.String(), "File saved to") {
		t.Errorf("out = %q", out.String())
	}
}

func TestExportRunStorageDeclineCancels(t *testing.T) {
	deps, _ := happyDeps(t, "")
	deps.FreeBytes = func() (int64, error) { return 1, nil } // force prompt
	deps.Confirm = func(string) (bool, error) { return false, nil }
	_, err := Run(context.Background(), exportTracker(), Options{
		AppID: 42, AppName: "parityapp", Interval: time.Millisecond,
	}, deps, &bytes.Buffer{})
	if err == nil || err.Error() != "Command canceled by user." {
		t.Errorf("err = %v", err)
	}
}

func TestExportRunMissingBytesWritten(t *testing.T) {
	deps, _ := happyDeps(t, "")
	orig := deps.FetchStatus
	deps.FetchStatus = func(ctx context.Context) (*BackupAndJobs, error) {
		st, err := orig(ctx)
		if err != nil {
			return nil, err
		}
		for i := range st.Jobs {
			st.Jobs[i].BytesWritten = ""
		}
		return st, nil
	}
	_, err := Run(context.Background(), exportTracker(), Options{
		AppID: 42, AppName: "parityapp", Interval: time.Millisecond,
	}, deps, &bytes.Buffer{})
	if err == nil || err.Error() != "Export job metadata does not contain bytesWritten" {
		t.Errorf("err = %v", err)
	}
}

func TestExportRunGenerateBackupPrintsNotice(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	deps, calls := happyDeps(t, "")
	var out bytes.Buffer
	_, err := Run(context.Background(), exportTracker(), Options{
		AppID: 42, AppName: "parityapp", GenerateBackup: true, Interval: time.Millisecond,
	}, deps, &out)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(*calls, "|"), "backup") {
		t.Error("RunBackup must fire with --generate-backup")
	}
	if !strings.Contains(out.String(), "NOTICE: ") ||
		!strings.Contains(out.String(), "If a recent database backup does not exist") {
		t.Errorf("out = %q", out.String())
	}
}

// TestDefaultPollTimeoutIsNodesSixHourCeiling pins the ceiling `vip export
// sql` inherits from Node: export-sql.ts:547 and :555 both call pollUntil
// with no explicit timeout, so both get the 6h default (utils.ts:18).
func TestDefaultPollTimeoutIsNodesSixHourCeiling(t *testing.T) {
	if DefaultPollTimeout != 6*time.Hour {
		t.Errorf("DefaultPollTimeout = %v, want 6h", DefaultPollTimeout)
	}
}

// TestExportRunStopsWhenJobNeverPrepares is the regression test for the
// unbounded pollStep loop: an export job whose preflight step never reaches
// "success" used to spin forever with nothing cancelling the context.
func TestExportRunStopsWhenJobNeverPrepares(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	deps, _ := happyDeps(t, "")
	fetches := 0
	deps.FetchStatus = func(ctx context.Context) (*BackupAndJobs, error) {
		fetches++
		// The job exists (so no CreateExport) but preflight never succeeds.
		return &BackupAndJobs{
			LatestBackup: &Backup{ID: 11, CreatedAt: "2026-06-11 10:00:00"},
			Jobs: []ExportJob{{
				BackupID:   11,
				StepStatus: map[string]string{"preflight": "running"},
			}},
		}, nil
	}

	done := make(chan error, 1)
	go func() {
		var out bytes.Buffer
		_, err := Run(context.Background(), exportTracker(), Options{
			AppID: 42, AppName: "parityapp",
			Interval: time.Millisecond,
			Timeout:  50 * time.Millisecond,
		}, deps, &out)
		done <- err
	}()

	select {
	case err := <-done:
		if err == nil || err.Error() != "Polling timed out" {
			t.Errorf("err = %v, want %q", err, "Polling timed out")
		}
		if fetches < 2 {
			t.Errorf("fetches = %d, want the loop to have actually polled", fetches)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run never returned: the export-job poll loop is unbounded")
	}
}

// TestExportRunStopsWhenJobNeverUploads covers the SECOND pollUntil
// (export-sql.ts:555): preflight succeeds, upload_backup never does.
func TestExportRunStopsWhenJobNeverUploads(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	deps, _ := happyDeps(t, "")
	deps.FetchStatus = func(ctx context.Context) (*BackupAndJobs, error) {
		return &BackupAndJobs{
			LatestBackup: &Backup{ID: 11, CreatedAt: "2026-06-11 10:00:00"},
			Jobs: []ExportJob{{
				BackupID:   11,
				StepStatus: map[string]string{"preflight": "success", "upload_backup": "running"},
			}},
		}, nil
	}

	done := make(chan error, 1)
	go func() {
		var out bytes.Buffer
		_, err := Run(context.Background(), exportTracker(), Options{
			AppID: 42, AppName: "parityapp",
			Interval: time.Millisecond,
			Timeout:  50 * time.Millisecond,
		}, deps, &out)
		done <- err
	}()

	select {
	case err := <-done:
		if err == nil || err.Error() != "Polling timed out" {
			t.Errorf("err = %v, want %q", err, "Polling timed out")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run never returned: the upload_backup poll loop is unbounded")
	}
}

func TestExportRunLiveCopyPath(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	deps, calls := happyDeps(t, "")
	deps.StartLive = func(ctx context.Context, cfg []byte) (string, error) {
		if !strings.Contains(string(cfg), `"type":"tables"`) || !strings.Contains(string(cfg), "wp_comments") {
			t.Errorf("cfg = %s", cfg)
		}
		return "copy-1", nil
	}
	deps.PollLiveURL = func(ctx context.Context, copyID string) (string, int64, error) {
		if copyID != "copy-1" {
			t.Errorf("copyID = %q", copyID)
		}
		return "https://dl.example/partial.sql.gz", 4096, nil
	}
	var out bytes.Buffer
	_, err := Run(context.Background(), exportTracker(), Options{
		AppID: 42, AppName: "parityapp", Interval: time.Millisecond,
		LiveCopy: &LiveCopyCLIOptions{UseLiveBackupCopy: true, Tables: []string{"wp_posts", "wp_comments"}},
	}, deps, &out)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(*calls, "|"), "download:https://dl.example/partial.sql.gz") {
		t.Errorf("calls = %v", *calls)
	}
}

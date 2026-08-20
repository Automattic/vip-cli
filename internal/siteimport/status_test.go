package siteimport

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/tui"
)

// scriptedFetch returns each snapshot in order, repeating the last.
func scriptedFetch(snaps []ProgressSnapshot) ProgressFetch {
	i := 0
	return func(ctx context.Context) (*ProgressSnapshot, error) {
		s := snaps[i]
		if i < len(snaps)-1 {
			i++
		}
		return &s, nil
	}
}

func TestCheckStatusSuccessFromJob(t *testing.T) {
	created := "Mon, 01 Jun 2026 00:00:00 UTC"
	completed := "Mon, 01 Jun 2026 00:05:00 UTC"
	snaps := []ProgressSnapshot{
		{Job: &ImportJob{CreatedAt: created, Status: "running", Steps: []JobStep{
			{ID: "preflights", Name: "Import preflights", Status: tui.StepSuccess},
			{ID: "import", Name: "Importing db", Status: tui.StepRunning},
		}}},
		{Job: &ImportJob{CreatedAt: created, CompletedAt: completed, Status: "success", Steps: []JobStep{
			{ID: "preflights", Name: "Import preflights", Status: tui.StepSuccess},
			{ID: "import", Name: "Importing db", Status: tui.StepSuccess},
		}}},
	}
	pt := tui.NewProgressTracker(nil)
	var polls int
	res, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch: scriptedFetch(snaps), Tracker: pt, Interval: time.Millisecond,
		OnPoll: func(_, _, _ string) { polls++ },
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != "success" || res.CompletedAt != completed {
		t.Errorf("res = %+v", res)
	}
	if polls < 2 {
		t.Errorf("OnPoll fired %d times, want >= 2", polls)
	}
	if !pt.AllStepsSucceeded() {
		t.Error("tracker should reflect all-success server steps")
	}
}

func TestCheckStatusJobErrorRejects(t *testing.T) {
	snaps := []ProgressSnapshot{
		{Job: &ImportJob{CreatedAt: "Mon, 01 Jun 2026 00:00:00 UTC", Status: "error", Steps: []JobStep{
			{ID: "import", Name: "Importing db", Status: tui.StepFailed},
		}}},
	}
	pt := tui.NewProgressTracker(nil)
	_, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch: scriptedFetch(snaps), Tracker: pt, Interval: time.Millisecond,
	})
	if err == nil || !strings.Contains(err.Error(), "Import job failed") {
		t.Errorf("err = %v", err)
	}
}

func TestCheckStatusMissingJobReturnsFast(t *testing.T) {
	snaps := []ProgressSnapshot{{Job: nil}}
	pt := tui.NewProgressTracker(nil)
	res, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch: scriptedFetch(snaps), Tracker: pt, Interval: time.Millisecond,
		ReturnMissingJobImmediately: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Message != "No import job found" {
		t.Errorf("message = %q", res.Message)
	}
}

func TestCheckStatusWaitsForProgressMeta(t *testing.T) {
	created := "Mon, 01 Jun 2026 00:00:00 UTC"
	snaps := []ProgressSnapshot{
		{Job: nil}, // meta not ready yet — must wait, not error
		{Job: &ImportJob{CreatedAt: created, CompletedAt: created, Status: "success", Steps: []JobStep{
			{ID: "import", Name: "Importing db", Status: tui.StepSuccess},
		}}},
	}
	pt := tui.NewProgressTracker(nil)
	res, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch: scriptedFetch(snaps), Tracker: pt, Interval: time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != "success" {
		t.Errorf("res = %+v", res)
	}
}

func TestCheckStatusEmptyStepsErrors(t *testing.T) {
	snaps := []ProgressSnapshot{
		{Job: &ImportJob{CreatedAt: "Mon, 01 Jun 2026 00:00:00 UTC", Status: "running"}},
	}
	pt := tui.NewProgressTracker(nil)
	_, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch: scriptedFetch(snaps), Tracker: pt, Interval: time.Millisecond,
	})
	if err == nil || err.Error() != "Could not enumerate the import job steps" {
		t.Errorf("err = %v", err)
	}
}

func TestCheckStatusFailedImportStepProducesStepError(t *testing.T) {
	now := time.Now()
	snaps := []ProgressSnapshot{{
		Job: &ImportJob{
			CreatedAt: now.Add(-time.Hour).UTC().Format(time.RFC1123),
			Status:    "running",
			Steps: []JobStep{
				{ID: "import", Name: "Import", Status: tui.StepRunning},
			},
		},
		StatusProgressStartedAt: now.Unix(),
		FailedStep: &FailedStep{
			Name: "importing_db", Output: []string{"ERROR 1064 (42000) at line 9"},
			StartedAt: now.Unix(),
		},
		Launched: false,
	}}
	pt := tui.NewProgressTracker(nil)
	_, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch: scriptedFetch(snaps), Tracker: pt, Interval: time.Millisecond,
	})
	var fe *ImportFailedError
	if !errors.As(err, &fe) {
		t.Fatalf("err = %v (type %T)", err, err)
	}
	if fe.StepName != "importing_db" || len(fe.CommandOutput) != 1 || !fe.InImportProgress {
		t.Errorf("fe = %+v", fe)
	}
	// The demoted server step renders the failed glyph (Node sets
	// hasFailure only for caller steps; server-step failure shows via the
	// glyph — progress.ts:264).
	if frame := pt.Frame(); !strings.Contains(frame, "✕") {
		t.Errorf("frame missing failed glyph: %q", frame)
	}
}

func TestCheckStatusOldFailedStepIgnored(t *testing.T) {
	// A failed step from BEFORE the job was created is stale and must be
	// ignored (status.ts:353-366 timestamp gate).
	now := time.Now()
	created := now.UTC().Format(time.RFC1123)
	snaps := []ProgressSnapshot{{
		Job: &ImportJob{
			CreatedAt: created, CompletedAt: created, Status: "success",
			Steps: []JobStep{{ID: "import", Name: "Import", Status: tui.StepSuccess}},
		},
		StatusProgressStartedAt: now.Add(-2 * time.Hour).Unix(),
		FailedStep: &FailedStep{
			Name: "importing_db", StartedAt: now.Add(-2 * time.Hour).Unix(),
		},
	}}
	pt := tui.NewProgressTracker(nil)
	res, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch: scriptedFetch(snaps), Tracker: pt, Interval: time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != "success" {
		t.Errorf("res = %+v", res)
	}
}

func TestGetErrorMessageBlocks(t *testing.T) {
	fe := &ImportFailedError{
		InImportProgress: true, ErrorText: "Import step failed",
		StepName: "importing_db", CommandOutput: []string{"line1", "line2"},
		Launched: false,
	}
	msg := GetErrorMessage(fe)
	for _, want := range []string{
		"Import step failed",
		"This error occurred during the mysql batch script processing of your SQL file.",
		"automatically being rolled back",
		"The server said:",
		"line1;line2",
	} {
		if !strings.Contains(msg, want) {
			t.Errorf("message missing %q:\n%s", want, msg)
		}
	}

	// launched suppresses the rollback notice
	fe.Launched = true
	if msg := GetErrorMessage(fe); strings.Contains(msg, "rolled back") {
		t.Errorf("launched env must not mention rollback:\n%s", msg)
	}

	// no command output → contact-support line
	fe.CommandOutput = nil
	if msg := GetErrorMessage(fe); !strings.Contains(msg, "Please contact support and include this message along with your sql file.") {
		t.Errorf("missing contact-support fallback:\n%s", msg)
	}

	// preflights block
	fe2 := &ImportFailedError{InImportProgress: true, ErrorText: "Import step failed", StepName: "import_preflights"}
	if msg := GetErrorMessage(fe2); !strings.Contains(msg, "Your site content was not altered.") {
		t.Errorf("preflights block missing:\n%s", msg)
	}

	// non-import-progress error returns the bare text
	fe3 := &ImportFailedError{ErrorText: "Could not enumerate the import job steps"}
	if msg := GetErrorMessage(fe3); msg != "Could not enumerate the import job steps" {
		t.Errorf("msg = %q", msg)
	}
}

func TestCapitalize(t *testing.T) {
	for in, want := range map[string]string{"": "", "import preflights": "Import preflights", "a": "A"} {
		if got := Capitalize(in); got != want {
			t.Errorf("Capitalize(%q) = %q", in, got)
		}
	}
}

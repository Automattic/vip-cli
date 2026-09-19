package tui

import (
	"strings"
	"testing"
)

func steps3() []ProgressStep {
	return []ProgressStep{
		{ID: "replace", Name: "Performing search and replace"},
		{ID: "upload", Name: "Uploading file"},
		{ID: "queue_import", Name: "Queueing import"},
	}
}

func TestProgressTrackerFrameOrderAndGlyphs(t *testing.T) {
	pt := NewProgressTracker(steps3())
	if err := pt.StepRunning("replace"); err != nil {
		t.Fatal(err)
	}
	frame := pt.Frame()
	lines := strings.Split(strings.TrimRight(frame, "\n"), "\n")
	if len(lines) != 3 {
		t.Fatalf("want 3 lines, got %d: %q", len(lines), frame)
	}
	if !strings.Contains(lines[0], "Performing search and replace") {
		t.Errorf("line 0 = %q", lines[0])
	}
	// pending glyph is ○ (Node format.ts getGlyphForStatus)
	if !strings.Contains(lines[1], "○") {
		t.Errorf("pending glyph missing: %q", lines[1])
	}
}

func TestProgressTrackerStepSuccessPromotesNext(t *testing.T) {
	pt := NewProgressTracker(steps3())
	_ = pt.StepRunning("replace")
	if err := pt.StepSuccess("replace"); err != nil {
		t.Fatal(err)
	}
	// Node progress.ts:150 — stepSuccess auto-promotes next pending to running.
	if got := pt.CurrentStepID(); got != "upload" {
		t.Errorf("current step = %q, want upload", got)
	}
}

func TestProgressTrackerCompletedStepRejected(t *testing.T) {
	pt := NewProgressTracker(steps3())
	_ = pt.StepSuccess("replace")
	err := pt.StepRunning("replace")
	if err == nil || !strings.Contains(err.Error(), "already completed") {
		t.Errorf("want already-completed error, got %v", err)
	}
	if err := pt.StepRunning("nope"); err == nil ||
		!strings.Contains(err.Error(), "is not valid") {
		t.Errorf("want invalid-step error, got %v", err)
	}
}

func TestProgressTrackerSkippedStepRejectsUpdates(t *testing.T) {
	pt := NewProgressTracker(steps3())
	_ = pt.StepSkipped("replace")
	if err := pt.StepRunning("replace"); err == nil ||
		!strings.Contains(err.Error(), "already completed") {
		t.Errorf("skipped step must reject updates (Node COMPLETED_STEP_SLUGS), got %v", err)
	}
}

func TestProgressTrackerUploadPercentageSuffix(t *testing.T) {
	pt := NewProgressTracker(steps3())
	_ = pt.StepRunning("upload")
	pt.SetUploadPercentage("42%")
	if frame := pt.Frame(); !strings.Contains(frame, "42%") {
		t.Errorf("frame missing percentage: %q", frame)
	}
	// percentage only renders while running (progress.ts:266-268)
	_ = pt.StepSuccess("upload")
	if frame := pt.Frame(); strings.Contains(frame, "42%") {
		t.Errorf("percentage must not render after success: %q", frame)
	}
}

func TestProgressTrackerServerStepsPromoteFirstPending(t *testing.T) {
	pt := NewProgressTracker(nil)
	pt.SetStepsFromServer([]ServerStep{
		{Name: "Import preflights", Status: StepSuccess},
		{Name: "Importing db", Status: StepPending},
	})
	// Node progress.ts:107 — no running step => first pending promoted.
	frame := pt.Frame()
	if !strings.Contains(frame, "Importing db") {
		t.Fatalf("frame = %q", frame)
	}
	if pt.AllStepsSucceeded() {
		t.Error("AllStepsSucceeded should be false with a pending step")
	}

	pt.SetStepsFromServer([]ServerStep{
		{Name: "Import preflights", Status: StepSuccess},
		{Name: "Importing db", Status: StepSuccess},
	})
	if !pt.AllStepsSucceeded() {
		t.Error("AllStepsSucceeded should be true when every step succeeded")
	}
}

func TestProgressTrackerHasFailure(t *testing.T) {
	pt := NewProgressTracker(steps3())
	_ = pt.StepFailed("upload")
	if !pt.HasFailure() {
		t.Error("HasFailure should be true")
	}
}

func TestProgressTrackerAdditionalInfoBullets(t *testing.T) {
	pt := NewProgressTracker(steps3())
	_ = pt.StepFailed("upload", "first detail", "second detail")
	frame := pt.Frame()
	if !strings.Contains(frame, "  - first detail") || !strings.Contains(frame, "  - second detail") {
		t.Errorf("additionalInfo bullets missing: %q", frame)
	}
}

func TestProgressTrackerSetProgressOnRunningStep(t *testing.T) {
	pt := NewProgressTracker([]ProgressStep{{ID: "download", Name: "Downloading file"}})
	_ = pt.StepRunning("download")
	pt.SetProgress("- 42.00% (10 MB/24 MB)")
	if frame := pt.Frame(); !strings.Contains(frame, "- 42.00% (10 MB/24 MB)") {
		t.Errorf("frame = %q", frame)
	}
	// progress renders on non-upload steps regardless of status once set
	// (progress.ts:270 `else if (progress)`).
	_ = pt.StepSuccess("download")
	if frame := pt.Frame(); !strings.Contains(frame, "42.00%") {
		t.Errorf("progress must persist after success: %q", frame)
	}
}

func TestProgressTrackerSetProgressNoRunningStepIsNoop(t *testing.T) {
	pt := NewProgressTracker(steps3())
	pt.SetProgress("- 10%")
	if frame := pt.Frame(); strings.Contains(frame, "- 10%") {
		t.Errorf("SetProgress without a running step must be a no-op (progress.ts:92): %q", frame)
	}
}

func TestProgressTrackerPrefixSuffix(t *testing.T) {
	pt := NewProgressTracker(steps3())
	pt.SetPrefix("HEAD\n")
	pt.SetSuffix("\nTAIL")
	frame := pt.Frame()
	if !strings.HasPrefix(frame, "HEAD\n") || !strings.HasSuffix(frame, "\nTAIL") {
		t.Errorf("prefix/suffix not rendered: %q", frame)
	}
}

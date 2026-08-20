package mediaimport

import (
	"strings"
	"testing"
)

func TestTrackerFrameProgressLine(t *testing.T) {
	tr := NewTracker()
	tr.SetPrefix("HEAD\n")
	tr.SetSuffix("\nTAIL")
	tr.SetStatus(Status{Status: "RUNNING", FilesTotal: 200, FilesProcessed: 50, HasFilesProcessed: true})
	frame := tr.Frame()
	// progress.ts:70: `Imported Files: 50/200 - 25% <glyph>`
	if !strings.Contains(frame, "Imported Files: 50/200 - 25%") {
		t.Errorf("frame = %q", frame)
	}
	if !strings.HasPrefix(frame, "HEAD\n") || !strings.HasSuffix(frame, "\nTAIL") {
		t.Errorf("prefix/suffix not rendered: %q", frame)
	}
}

func TestTrackerFrameNoCountsRendersEmptyLogs(t *testing.T) {
	tr := NewTracker()
	tr.SetStatus(Status{Status: "INITIALIZING"})
	// progress.ts:66: logs only render when filesProcessed is a number AND
	// filesTotal is truthy; otherwise prefix+suffix only.
	if frame := tr.Frame(); strings.Contains(frame, "Imported Files") {
		t.Errorf("frame = %q", frame)
	}
}

func TestTrackerHasFailure(t *testing.T) {
	tr := NewTracker()
	tr.SetStatus(Status{Status: "FAILED"})
	if !tr.HasFailure() {
		t.Error("FAILED status must set hasFailure (progress.ts:39)")
	}
}

func TestGlyphForMediaStatus(t *testing.T) {
	// status.ts:83 vocabulary.
	for status, want := range map[string]string{
		"INITIALIZING": "○",
		"COMPLETED":    "✓",
		"FAILED":       "✕",
		"ABORTED":      "⚠️",
		"ABORTING":     "⚠️",
	} {
		if got := GlyphForMediaStatus(status, "⠋"); !strings.Contains(got, want) {
			t.Errorf("GlyphForMediaStatus(%q) = %q, want contains %q", status, got, want)
		}
	}
	if got := GlyphForMediaStatus("bogus", "⠋"); got != "" {
		t.Errorf("unknown status must render empty, got %q", got)
	}
	for _, spinning := range []string{"INITIALIZED", "RUNNING", "COMPLETING", "RAN", "VALIDATING", "VALIDATED"} {
		if got := GlyphForMediaStatus(spinning, "⠋"); !strings.Contains(got, "⠋") {
			t.Errorf("GlyphForMediaStatus(%q) = %q, want spinner", spinning, got)
		}
	}
}

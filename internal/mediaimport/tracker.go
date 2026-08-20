package mediaimport

import (
	"fmt"
	"strings"
	"sync"

	"github.com/fatih/color"

	"github.com/Automattic/vip/internal/tui"
)

// FailureDetails mirrors AppEnvironmentMediaImportStatusFailureDetails.
type FailureDetails struct {
	PreviousStatus string
	GlobalErrors   []string
	FileErrorsURL  string
}

// FileError mirrors AppEnvironmentMediaImportStatusFailureDetailsFileErrors.
// JSON tags drive both the error-log download decode and the exported
// JSON report shape (status.ts:139-144).
type FileError struct {
	FileName string   `json:"fileName"`
	Errors   []string `json:"errors"`
}

// Status mirrors the subset of AppEnvironmentMediaImportStatus the
// tracker and poller consume (progress.ts:9 + status.ts:36-47).
// HasFilesProcessed distinguishes 0 from absent (Node checks
// `typeof filesProcessed === 'number'`, progress.ts:66).
type Status struct {
	ImportID          int64
	SiteID            int64
	Status            string
	FilesTotal        int64
	FilesProcessed    int64
	HasFilesProcessed bool
	FailureDetails    *FailureDetails
}

// GlyphForMediaStatus ports media-import/status.ts:83 getGlyphForStatus.
// spinner is the current braille frame.
func GlyphForMediaStatus(status, spinner string) string {
	switch status {
	case "INITIALIZING":
		return "○"
	case "INITIALIZED", "RUNNING", "COMPLETING", "RAN", "VALIDATING", "VALIDATED":
		return color.HiBlueString(spinner)
	case "COMPLETED":
		return color.GreenString("✓")
	case "FAILED":
		return color.RedString("✕")
	case "ABORTED", "ABORTING":
		return color.YellowString("⚠️")
	default:
		return ""
	}
}

// Tracker ports MediaImportProgressTracker (media-import/progress.ts:14).
// Frame() renders `<prefix><logs><suffix>` where logs is the one-line
// files-processed summary (progress.ts:70). Implements the commands'
// frameSource interface. Safe for concurrent use (render ticker vs.
// poller goroutine).
type Tracker struct {
	mu         sync.Mutex
	status     Status
	hasFailure bool
	spinnerIdx int
	prefix     string
	suffix     string
}

func NewTracker() *Tracker { return &Tracker{} }

func (t *Tracker) SetPrefix(p string) { t.mu.Lock(); defer t.mu.Unlock(); t.prefix = p }
func (t *Tracker) SetSuffix(s string) { t.mu.Lock(); defer t.mu.Unlock(); t.suffix = s }

// AppendSuffix mirrors Node's `progressTracker.suffix += ...` calls in
// the error-log download flow (status.ts:286 etc.).
func (t *Tracker) AppendSuffix(s string) { t.mu.Lock(); defer t.mu.Unlock(); t.suffix += s }

// SetStatus ports setStatus (progress.ts:38).
func (t *Tracker) SetStatus(s Status) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if s.Status == "FAILED" {
		t.hasFailure = true
	}
	t.status = s
}

func (t *Tracker) HasFailure() bool { t.mu.Lock(); defer t.mu.Unlock(); return t.hasFailure }

// Frame ports print (progress.ts:58): prefix + optional progress line +
// suffix. The spinner advances per Frame call (RunningSprite parity).
func (t *Tracker) Frame() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	spinner := tui.SpinnerGlyphs[t.spinnerIdx]
	t.spinnerIdx = (t.spinnerIdx + 1) % len(tui.SpinnerGlyphs)

	logs := ""
	if t.status.HasFilesProcessed && t.status.FilesTotal > 0 {
		pct := 100 * t.status.FilesProcessed / t.status.FilesTotal
		logs = fmt.Sprintf("Imported Files: %d/%d - %d%% %s",
			t.status.FilesProcessed, t.status.FilesTotal, pct,
			GlyphForMediaStatus(t.status.Status, spinner))
	}
	var b strings.Builder
	b.WriteString(t.prefix)
	b.WriteString(logs)
	b.WriteString(t.suffix)
	return b.String()
}

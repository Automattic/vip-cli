package tui

import (
	"fmt"
	"strings"
	"sync"

	"github.com/fatih/color"
)

// StepState mirrors Node's StepStatus enum (src/lib/cli/progress.ts:8).
type StepState string

const (
	StepPending StepState = "pending"
	StepRunning StepState = "running"
	StepSuccess StepState = "success"
	StepFailed  StepState = "failed"
	StepUnknown StepState = "unknown"
	StepSkipped StepState = "skipped"
)

// SpinnerGlyphs is Node's RUNNING_SPRITE_GLYPHS (src/lib/cli/format.ts:152).
var SpinnerGlyphs = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

// GlyphForStatus mirrors Node format.ts getGlyphForStatus (format.ts:169).
// spinner is the current spinner glyph used for "running".
func GlyphForStatus(s StepState, spinner string) string {
	switch s {
	case StepPending:
		return "○"
	case StepRunning:
		return color.HiBlueString(spinner)
	case StepSuccess:
		return color.GreenString("✓")
	case StepFailed:
		return color.RedString("✕")
	case StepUnknown:
		return color.YellowString("✕")
	case StepSkipped:
		return color.GreenString("-")
	default:
		return ""
	}
}

// ProgressStep seeds a caller-defined step.
type ProgressStep struct {
	ID   string
	Name string
}

// ServerStep is a server-reported step (Node's StepFromServer,
// progress.ts:30).
type ServerStep struct {
	Name   string
	Status StepState
}

type trackedStep struct {
	id             string
	name           string
	status         StepState
	percentage     string   // upload step only (progress.ts:83)
	progress       string   // generic per-step progress line (progress.ts:91)
	additionalInfo []string // bullet lines under the step
}

// ProgressTracker ports Node's ProgressTracker (src/lib/cli/progress.ts:35).
// Caller-defined steps render first, then server-reported steps — Node
// merges the two maps in that order (progress.ts:72).
//
// Safe for concurrent use: the upload progress callback fires from worker
// goroutines while a render ticker reads Frame().
type ProgressTracker struct {
	mu         sync.Mutex
	fromCaller []*trackedStep
	fromServer []*trackedStep
	spinnerIdx int
	hasFailure bool
	prefix     string
	suffix     string
}

// NewProgressTracker builds a tracker with the given caller-defined steps,
// all starting pending (progress.ts:76 mapSteps default).
func NewProgressTracker(steps []ProgressStep) *ProgressTracker {
	pt := &ProgressTracker{}
	for _, s := range steps {
		pt.fromCaller = append(pt.fromCaller, &trackedStep{
			id: s.ID, name: s.Name, status: StepPending,
		})
	}
	return pt
}

// SetPrefix sets the text printed before the step list (progress.ts:48).
func (pt *ProgressTracker) SetPrefix(p string) {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	pt.prefix = p
}

// SetSuffix sets the text printed after the step list (progress.ts:51).
func (pt *ProgressTracker) SetSuffix(s string) {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	pt.suffix = s
}

func (pt *ProgressTracker) find(id string) *trackedStep {
	for _, s := range pt.fromCaller {
		if s.id == id {
			return s
		}
	}
	return nil
}

// setStatus mirrors setStatusForStepId (progress.ts:163). Completed steps
// (success/skipped — COMPLETED_STEP_SLUGS, progress.ts:17) reject further
// updates. Error strings are Node's exact messages.
func (pt *ProgressTracker) setStatus(id string, status StepState, info []string) error {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	s := pt.find(id)
	if s == nil {
		return fmt.Errorf("Step name %s is not valid.", id)
	}
	if s.status == StepSuccess || s.status == StepSkipped {
		return fmt.Errorf("Step name %s is already completed.", id)
	}
	if status == StepFailed {
		pt.hasFailure = true
	}
	s.status = status
	s.additionalInfo = info
	return nil
}

func (pt *ProgressTracker) StepRunning(id string, info ...string) error {
	return pt.setStatus(id, StepRunning, info)
}

func (pt *ProgressTracker) StepFailed(id string, info ...string) error {
	return pt.setStatus(id, StepFailed, info)
}

func (pt *ProgressTracker) StepSkipped(id string, info ...string) error {
	return pt.setStatus(id, StepSkipped, info)
}

// StepSuccess marks id success and auto-promotes the next pending step to
// running (progress.ts:150).
func (pt *ProgressTracker) StepSuccess(id string, info ...string) error {
	if err := pt.setStatus(id, StepSuccess, info); err != nil {
		return err
	}
	pt.mu.Lock()
	defer pt.mu.Unlock()
	for _, s := range pt.all() {
		if s.status == StepPending {
			s.status = StepRunning
			break
		}
	}
	return nil
}

// SetUploadPercentage stores the percentage shown next to the "upload"
// step while it is running (progress.ts:83 setUploadPercentage).
func (pt *ProgressTracker) SetUploadPercentage(p string) {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	if s := pt.find("upload"); s != nil {
		s.percentage = p
	}
}

// SetProgress stores a free-form progress string on the CURRENT running
// step (progress.ts:91 setProgress via getCurrentStep). No-op when no
// step is running.
func (pt *ProgressTracker) SetProgress(p string) {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	for _, s := range pt.all() {
		if s.status == StepRunning {
			s.progress = p
			return
		}
	}
}

// SetStepsFromServer replaces the server-step list. If no server step is
// running, the first pending one is promoted to running (progress.ts:100
// setStepsFromServer).
func (pt *ProgressTracker) SetStepsFromServer(steps []ServerStep) {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	anyRunning := false
	for _, s := range steps {
		if s.Status == StepRunning {
			anyRunning = true
			break
		}
	}
	out := make([]*trackedStep, 0, len(steps))
	promoted := false
	for i, s := range steps {
		st := s.Status
		if !anyRunning && !promoted && st == StepPending {
			st = StepRunning
			promoted = true
		}
		out = append(out, &trackedStep{
			id:     fmt.Sprintf("server-%d-%s", i, s.Name),
			name:   s.Name,
			status: st,
		})
	}
	pt.fromServer = out
}

// all returns caller steps followed by server steps. Caller must hold mu.
func (pt *ProgressTracker) all() []*trackedStep {
	merged := make([]*trackedStep, 0, len(pt.fromCaller)+len(pt.fromServer))
	merged = append(merged, pt.fromCaller...)
	merged = append(merged, pt.fromServer...)
	return merged
}

// AllStepsSucceeded mirrors allStepsSucceeded (progress.ts:159): every
// step (caller + server) must be success.
func (pt *ProgressTracker) AllStepsSucceeded() bool {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	for _, s := range pt.all() {
		if s.status != StepSuccess {
			return false
		}
	}
	return true
}

func (pt *ProgressTracker) HasFailure() bool {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	return pt.hasFailure
}

// CurrentStepID returns the id of the first running step ("" if none).
func (pt *ProgressTracker) CurrentStepID() string {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	for _, s := range pt.all() {
		if s.status == StepRunning {
			return s.id
		}
	}
	return ""
}

// Frame renders the current state as a multi-line block, one line per
// step (Node progress.ts:252 print()). Line shape is
// "<glyph> <name> <suffix>\n" — note the trailing space before an empty
// suffix, matching Node's `${statusIcon} ${name} ${suffix}\n`. The
// spinner advances one glyph per Frame call, mirroring
// RunningSprite.toString()'s advance-on-read (format.ts:160).
func (pt *ProgressTracker) Frame() string {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	spinner := SpinnerGlyphs[pt.spinnerIdx]
	pt.spinnerIdx = (pt.spinnerIdx + 1) % len(SpinnerGlyphs)

	var b strings.Builder
	b.WriteString(pt.prefix)
	for _, s := range pt.all() {
		suffix := ""
		if s.id == "upload" {
			if s.status == StepRunning && s.percentage != "" {
				suffix = s.percentage
			}
		} else if s.progress != "" {
			// progress.ts:270 — non-upload steps render their progress
			// string whenever set, regardless of status.
			suffix = s.progress
		}
		if len(s.additionalInfo) > 0 {
			var infoLines []string
			for _, info := range s.additionalInfo {
				infoLines = append(infoLines, "  - "+info)
			}
			suffix += "\n" + strings.Join(infoLines, "\n")
		}
		fmt.Fprintf(&b, "%s %s %s\n", GlyphForStatus(s.status, spinner), s.name, suffix)
	}
	b.WriteString(pt.suffix)
	return b.String()
}

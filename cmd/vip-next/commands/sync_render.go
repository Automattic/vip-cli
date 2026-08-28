package commands

import (
	"fmt"
	"io"
	stdsync "sync"
	"time"

	"github.com/fatih/color"

	syncpkg "github.com/Automattic/vip/internal/sync"
	"github.com/Automattic/vip/internal/tui"
)

// brailleSpinner is the Node-parity spinner sequence (matches
// @wwa/single-line-log's default frame set used by vip-cli's
// upstream sync.js).
var brailleSpinner = []string{
	"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
}

// spinnerInterval is how often the spinner advances when rendering on
// TTY. Matches Node's src/bin/vip-sync.js setInterval(..., 100) exactly.
const spinnerInterval = 100 * time.Millisecond

// markFor returns the colored leading mark for a step based on its
// status. Spinner frames are only consulted for running steps.
//
// Node parity (per src/bin/vip-sync.js):
//
//	pending → dim ○
//	running → blue braille spinner frame
//	success → green ✓
//	failed  → red ✕
//	other   → yellow ✕ (defensive: covers any new server-side status
//	                    string we haven't enumerated yet)
func markFor(status, spinnerFrame string) string {
	switch status {
	case syncpkg.StatusPending:
		return color.New(color.Faint).Sprint("○")
	case syncpkg.StatusRunning:
		return color.New(color.FgHiBlue).Sprint(spinnerFrame)
	case syncpkg.StatusSuccess:
		return color.New(color.FgGreen).Sprint("✓")
	case syncpkg.StatusFailed:
		return color.New(color.FgRed).Sprint("✕")
	default:
		return color.New(color.FgYellow).Sprint("✕")
	}
}

// buildSyncFrame composes the per-tick frame: blank top line, one
// "  <mark> <name>" row per step (dim when pending), blank bottom line.
// The footer is rendered separately (or once the loop exits) so we keep
// the renderer's line count stable across frames.
func buildSyncFrame(steps []syncpkg.Step, spinnerFrame string) []string {
	lines := make([]string, 0, len(steps)+2)
	lines = append(lines, "")
	for _, s := range steps {
		mark := markFor(s.Status, spinnerFrame)
		row := fmt.Sprintf("  %s %s", mark, s.Name)
		if s.Status == syncpkg.StatusPending {
			row = color.New(color.Faint).Sprint(row)
		}
		lines = append(lines, row)
	}
	lines = append(lines, "")
	return lines
}

// syncRenderer is the unified rendering surface used by runSync. TTY
// callers get an animated frame-based renderer; non-TTY callers get a
// per-transition line printer (preserving the M6 parity behavior).
type syncRenderer interface {
	// OnTransition is invoked from Poll whenever a step's status
	// changes. Implementations either re-render the live frame (TTY)
	// or emit one stdout line (non-TTY).
	OnTransition(s syncpkg.Step)
	// Stop cleans up background animation goroutines (TTY) and resets
	// renderer state. Safe to call multiple times.
	Stop()
}

// nonTTYRenderer preserves the pre-task-6 behavior: one stdout line
// per step transition. Used in CI, parity scenarios, and any other
// non-TTY context.
type nonTTYRenderer struct {
	w io.Writer
}

func newNonTTYRenderer(w io.Writer) *nonTTYRenderer {
	return &nonTTYRenderer{w: w}
}

func (r *nonTTYRenderer) OnTransition(s syncpkg.Step) {
	fmt.Fprintln(r.w, formatStepLine(s))
}

func (r *nonTTYRenderer) Stop() {}

// ttyRenderer drives the in-place frame renderer + a background ticker
// that animates the spinner between transitions. The shared state is
// the latest steps slice; OnTransition merges new step status in,
// and the ticker reads under mutex to redraw.
type ttyRenderer struct {
	mu         stdsync.Mutex
	steps      []syncpkg.Step
	stepIndex  map[string]int
	renderer   *tui.MultiLineRenderer
	spinnerIdx int
	done       chan struct{}
	loopDone   stdsync.WaitGroup
	stopped    bool
}

func newTTYRenderer(w io.Writer) *ttyRenderer {
	r := &ttyRenderer{
		stepIndex: make(map[string]int),
		renderer:  tui.NewMultiLineRenderer(w, true),
		done:      make(chan struct{}),
	}
	r.loopDone.Add(1)
	go r.loop()
	return r
}

// keyOf mirrors internal/sync.Poll's keying: stable step id when
// present, falling back to Name.
func keyOfStep(s syncpkg.Step) string {
	if s.Step != "" {
		return s.Step
	}
	return s.Name
}

func (r *ttyRenderer) OnTransition(s syncpkg.Step) {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := keyOfStep(s)
	if i, ok := r.stepIndex[k]; ok {
		r.steps[i] = s
	} else {
		r.stepIndex[k] = len(r.steps)
		r.steps = append(r.steps, s)
	}
	// Re-render immediately on transition so the user sees status
	// changes without waiting for the next spinner tick.
	r.renderLocked()
}

// loop animates the spinner. Runs until Stop closes r.done.
func (r *ttyRenderer) loop() {
	defer r.loopDone.Done()
	tk := time.NewTicker(spinnerInterval)
	defer tk.Stop()
	for {
		select {
		case <-r.done:
			return
		case <-tk.C:
			r.mu.Lock()
			r.spinnerIdx = (r.spinnerIdx + 1) % len(brailleSpinner)
			// Only redraw when there's an active spinner to advance —
			// i.e. at least one running step. Otherwise we'd be doing
			// pointless writes while the loop waits for the next poll.
			if r.hasRunningLocked() {
				r.renderLocked()
			}
			r.mu.Unlock()
		}
	}
}

func (r *ttyRenderer) hasRunningLocked() bool {
	for _, s := range r.steps {
		if s.Status == syncpkg.StatusRunning {
			return true
		}
	}
	return false
}

func (r *ttyRenderer) renderLocked() {
	frame := buildSyncFrame(r.steps, brailleSpinner[r.spinnerIdx])
	r.renderer.Render(frame)
}

func (r *ttyRenderer) Stop() {
	r.mu.Lock()
	if r.stopped {
		r.mu.Unlock()
		return
	}
	r.stopped = true
	r.mu.Unlock()
	close(r.done)
	// Block until the ticker goroutine has actually exited before we
	// touch r.renderer.Done(). Otherwise the ticker could be mid-render
	// (mutating MultiLineRenderer.lastRows) while we reset it from the
	// caller's goroutine — a data race MultiLineRenderer's "not safe for
	// concurrent use" contract would surface.
	r.loopDone.Wait()
	// Reset so any subsequent writes from the handler (final terminal
	// status line) flow naturally below the frame instead of trying to
	// overwrite it.
	r.renderer.Done()
}

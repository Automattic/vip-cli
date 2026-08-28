// Package tui hosts terminal UI primitives shared across commands.
//
// MultiLineRenderer drives in-place spinner/step-list rendering (vip
// sync's progress display today; future heavy commands such as backup
// progress and SQL-import progress will share it). Tested in isolation
// so the per-command callers stay free of ANSI string-building.
//
// Scope is intentionally narrow: this package hosts UI primitives, not a
// widget library. ProgressTracker (progress_tracker.go) is the shared
// step-list/spinner port of Node's lib/cli/progress.ts used by the heavy
// commands; truly command-specific framing still lives with callers in
// cmd/.
package tui

import (
	"fmt"
	"io"
	"regexp"

	"golang.org/x/term"
)

// ansiSGRRe matches CSI escape sequences (colors etc.) so visibleWidth can
// measure the on-screen width of a colorized line.
var ansiSGRRe = regexp.MustCompile("\x1b\\[[0-9;]*[A-Za-z]")

// visibleWidth is the number of on-screen columns a line occupies: its rune
// count with ANSI escape sequences stripped (the step glyphs are color-wrapped,
// e.g. a green ✓, which must not inflate the width).
func visibleWidth(s string) int {
	return len([]rune(ansiSGRRe.ReplaceAllString(s, "")))
}

// MultiLineRenderer rewrites a multi-line block in place when attached
// to a TTY, falling back to plain append on non-TTY writers.
//
// Concurrency: not safe for concurrent use; callers must serialize
// Render/Done.
type MultiLineRenderer struct {
	w   io.Writer
	tty bool
	// fd is the terminal file descriptor used to query the width, or -1 when
	// the writer is not a terminal file (e.g. a bytes.Buffer in tests).
	fd int
	// width, when > 0, overrides the queried terminal width (test seam).
	width int
	// lastRows is the number of PHYSICAL rows the previous frame occupied —
	// long lines wrap, so this is not the same as the logical line count.
	lastRows int
}

// NewMultiLineRenderer constructs a renderer. When tty is false the
// renderer never emits ANSI escape sequences and Render simply appends
// each frame's lines to w (CI / pipe behavior). On a TTY, if w exposes a
// terminal file descriptor the renderer becomes width-aware so wrapped
// lines are cleared correctly.
func NewMultiLineRenderer(w io.Writer, tty bool) *MultiLineRenderer {
	r := &MultiLineRenderer{w: w, tty: tty, fd: -1}
	if tty {
		if f, ok := w.(interface{ Fd() uintptr }); ok {
			r.fd = int(f.Fd())
		}
	}
	return r
}

// cols returns the current terminal width, or 0 when it can't be determined
// (in which case rendering falls back to counting logical lines).
func (r *MultiLineRenderer) cols() int {
	if r.width > 0 {
		return r.width
	}
	if r.fd >= 0 {
		if c, _, err := term.GetSize(r.fd); err == nil && c > 0 {
			return c
		}
	}
	return 0
}

// physicalRows is the number of screen rows a frame occupies once long lines
// wrap at the terminal width. When the width is unknown it degrades to the
// logical line count (the pre-width-aware behavior, fine for non-wrapping
// callers and buffer-backed tests).
func (r *MultiLineRenderer) physicalRows(lines []string) int {
	c := r.cols()
	if !r.tty || c <= 0 {
		return len(lines)
	}
	rows := 0
	for _, line := range lines {
		w := visibleWidth(line)
		if w == 0 {
			rows++ // an empty line still occupies one row
		} else {
			rows += (w + c - 1) / c // ceil(w / cols)
		}
	}
	return rows
}

// Render writes a frame. On TTY, subsequent calls overwrite the
// previously rendered block by moving the cursor up and erasing each
// prior PHYSICAL row before re-emitting. On non-TTY, every call appends.
//
// The frame is always terminated with newlines so the cursor lands on a
// fresh line, which keeps the math simple for the next call (we know the
// cursor is lastRows below the frame's first row). Because a line longer
// than the terminal wraps onto multiple rows, the cursor movement counts
// physical rows, not logical lines — counting lines leaves the wrapped
// remainder on screen, which is the "repeated lines" progress bug.
func (r *MultiLineRenderer) Render(lines []string) {
	if r.tty && r.lastRows > 0 {
		// Move cursor up to the first row of the previous frame.
		// \033[<n>F moves up n rows and parks at column 1.
		fmt.Fprintf(r.w, "\033[%dF", r.lastRows)
		// Erase each previous row. \033[2K clears the entire line;
		// \033[1B moves down one line without scrolling. We deliberately
		// don't combine these into a single "clear-from-cursor-to-end"
		// (\033[J) because that also nukes anything below — and on some
		// terminals (notably tmux) it can leave artifacts when the new
		// frame is shorter than the old one.
		for i := 0; i < r.lastRows; i++ {
			fmt.Fprint(r.w, "\033[2K")
			if i < r.lastRows-1 {
				fmt.Fprint(r.w, "\033[1B")
			}
		}
		// Cursor is now on the last cleared row. Move back up to the
		// first cleared row so the upcoming Fprintln calls overwrite
		// from the top. lastRows-1 because we're already on the last
		// of the n cleared rows.
		if r.lastRows > 1 {
			fmt.Fprintf(r.w, "\033[%dF", r.lastRows-1)
		} else {
			// Single-row case: we're sitting on the cleared row at
			// column 1, ready to write — no further movement needed.
			fmt.Fprint(r.w, "\r")
		}
	}
	for _, line := range lines {
		fmt.Fprintln(r.w, line)
	}
	r.lastRows = r.physicalRows(lines)
}

// Done resets internal state so the next Render writes a fresh frame
// rather than trying to overwrite the (now-finalized) previous one.
// Callers invoke this after they've printed terminal-state output and
// want subsequent writes to flow naturally.
func (r *MultiLineRenderer) Done() {
	r.lastRows = 0
}

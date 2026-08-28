package tui

import (
	"bytes"
	"strings"
	"testing"
)

func TestMultiLineRendererFirstFrame(t *testing.T) {
	var buf bytes.Buffer
	r := NewMultiLineRenderer(&buf, true /*tty*/)
	r.Render([]string{"step1", "step2", "step3"})
	out := buf.String()
	if !strings.Contains(out, "step1") || !strings.Contains(out, "step2") || !strings.Contains(out, "step3") {
		t.Errorf("first frame must write all lines; got %q", out)
	}
	// No cursor-up sequence on first frame.
	if strings.Contains(out, "\033[3F") || strings.Contains(out, "\033[3A") {
		t.Errorf("first frame must not emit cursor-up; got %q", out)
	}
}

func TestMultiLineRendererSubsequentFrameRedraws(t *testing.T) {
	var buf bytes.Buffer
	r := NewMultiLineRenderer(&buf, true)
	r.Render([]string{"a", "b"})
	buf.Reset()
	r.Render([]string{"a'", "b'"})
	out := buf.String()
	if !strings.Contains(out, "\033[") {
		t.Errorf("second frame must emit ANSI cursor manipulation; got %q", out)
	}
	if !strings.Contains(out, "a'") || !strings.Contains(out, "b'") {
		t.Errorf("second frame must include new lines; got %q", out)
	}
}

func TestMultiLineRendererNonTTYWritesLinesNoANSI(t *testing.T) {
	var buf bytes.Buffer
	r := NewMultiLineRenderer(&buf, false /*non-tty*/)
	r.Render([]string{"a", "b"})
	r.Render([]string{"c", "d"})
	out := buf.String()
	if strings.Contains(out, "\033[") {
		t.Errorf("non-TTY must emit zero ANSI escapes; got %q", out)
	}
	for _, want := range []string{"a", "b", "c", "d"} {
		if !strings.Contains(out, want) {
			t.Errorf("non-TTY output missing %q; got %q", want, out)
		}
	}
}

// TestMultiLineRendererWidthAwareCursorUp is the regression for the sync/import
// progress "repeated lines" bug: a line longer than the terminal width wraps to
// multiple physical rows, so the cursor must move up by PHYSICAL rows, not
// logical lines. With width 40, ["short", 100×'A'] occupies 1 + ceil(100/40)=3
// = 4 physical rows; the redraw must emit \033[4F, not \033[2F.
func TestMultiLineRendererWidthAwareCursorUp(t *testing.T) {
	var buf bytes.Buffer
	r := NewMultiLineRenderer(&buf, true /*tty*/)
	r.width = 40 // test seam (same package): pretend the terminal is 40 cols

	frame := []string{"short", strings.Repeat("A", 100)}
	r.Render(frame)
	buf.Reset()
	r.Render(frame)
	out := buf.String()

	if !strings.Contains(out, "\033[4F") {
		t.Errorf("redraw must move up 4 physical rows (\\033[4F); got %q", out)
	}
	if strings.Contains(out, "\033[2F") {
		t.Errorf("redraw must NOT move up by logical line count (\\033[2F); got %q", out)
	}
}

// TestVisibleWidthStripsANSI ensures colorized glyphs don't inflate the width
// (the step glyphs are color-wrapped, e.g. green ✓), which would otherwise
// over-count physical rows.
func TestVisibleWidthStripsANSI(t *testing.T) {
	// "\033[32m✓\033[0m ok" → visible "✓ ok" = 4 runes.
	if got := visibleWidth("\033[32m✓\033[0m ok"); got != 4 {
		t.Errorf("visibleWidth = %d, want 4", got)
	}
	if got := visibleWidth("plain"); got != 5 {
		t.Errorf("visibleWidth(plain) = %d, want 5", got)
	}
}

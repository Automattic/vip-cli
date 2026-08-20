package output

import (
	"strings"
	"testing"
)

func TestNodeColumnWidthsPreserveShortColumnsAndShrinkLongest(t *testing.T) {
	headers := []string{"timestamp", "message"}
	rows := [][]string{{
		"2026-07-15T07:17:38.002797318Z",
		strings.Repeat("long message ", 20),
	}}

	got := nodeColumnWidths(headers, rows, 78)
	want := []int{30, 41}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("nodeColumnWidths() = %v, want %v", got, want)
	}
	if width := nodeTableWidth(got); width != 78 {
		t.Fatalf("nodeTableWidth() = %d, want 78", width)
	}
}

func TestNodeColumnWidthsFitManyColumns(t *testing.T) {
	headers := []string{"timestamp", "rows sent", "rows examined", "query time", "request uri", "query"}
	rows := [][]string{{
		"2026-07-15T07:17:38.002797318Z", "10", "1000", "1.234",
		"/wp-admin/edit.php?post_type=very-long-value",
		strings.Repeat("SELECT post_id FROM wp_posts ", 20),
	}}

	widths := nodeColumnWidths(headers, rows, 78)
	if width := nodeTableWidth(widths); width > 78 {
		t.Fatalf("nodeTableWidth(%v) = %d, want <= 78", widths, width)
	}
}

func TestNodeColumnWidthsUseStructuralMinimumWhenTerminalIsTooNarrow(t *testing.T) {
	widths := nodeColumnWidths([]string{"alpha", "beta", "gamma"}, [][]string{{"a", "b", "c"}}, 5)
	want := []int{1, 1, 1}
	if len(widths) != len(want) || widths[0] != 1 || widths[1] != 1 || widths[2] != 1 {
		t.Fatalf("nodeColumnWidths() = %v, want %v", widths, want)
	}
}

func TestNodeColumnWidthsGiveEmptyColumnsOneDisplayCellWhenConstrained(t *testing.T) {
	widths := nodeColumnWidths([]string{"", "message"}, [][]string{{"", strings.Repeat("wide ", 20)}}, 12)
	if len(widths) != 2 || widths[0] != 1 {
		t.Fatalf("nodeColumnWidths() = %v, want empty constrained column width 1", widths)
	}
}

func TestNodeColumnWidthsKeepNaturalEmptyColumnZeroWithoutConstraint(t *testing.T) {
	widths := nodeColumnWidths([]string{""}, [][]string{{""}}, 0)
	if len(widths) != 1 || widths[0] != 0 {
		t.Fatalf("nodeColumnWidths() = %v, want original natural width [0]", widths)
	}
}

func TestWrapNodeCellUsesWordsAndHardWrapsLongTokens(t *testing.T) {
	if got, want := wrapNodeCell("alpha beta gamma", 10), []string{"alpha beta", "gamma"}; strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("word wrap = %#v, want %#v", got, want)
	}
	if got, want := wrapNodeCell("abcdefghijk", 5), []string{"abcde", "fghij", "k"}; strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("hard wrap = %#v, want %#v", got, want)
	}
}

func TestWrapNodeCellPreservesExplicitNewlinesAndUnicodeWidth(t *testing.T) {
	if got, want := wrapNodeCell("alpha\n\nbeta", 20), []string{"alpha", "", "beta"}; strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("explicit lines = %#v, want %#v", got, want)
	}
	if got, want := wrapNodeCell("界界界", 4), []string{"界界", "界"}; strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("Unicode wrap = %#v, want %#v", got, want)
	}
}

func TestWrapNodeCellPreservesANSIStateAcrossGeneratedLines(t *testing.T) {
	got := wrapNodeCell("\x1b[31malpha beta gamma\x1b[39m", 10)
	if len(got) != 2 {
		t.Fatalf("wrapped lines = %#v, want 2 lines", got)
	}
	if stripNodeANSI(got[0]) != "alpha beta" || stripNodeANSI(got[1]) != "gamma" {
		t.Fatalf("visible wrapped lines = %#v", got)
	}
	for i, line := range got {
		if !strings.Contains(line, "\x1b[31m") || !strings.Contains(line, "\x1b[39m") {
			t.Fatalf("line %d does not contain balanced foreground state: %q", i, line)
		}
	}
}

func TestWrapNodeCellPreservesTrueColorANSIStateAcrossGeneratedLines(t *testing.T) {
	const open = "\x1b[38;2;255;31;0m"
	const close = "\x1b[39m"

	got := wrapNodeCell(open+"alpha beta gamma"+close, 10)
	if len(got) != 2 {
		t.Fatalf("wrapped lines = %#v, want 2 lines", got)
	}
	for i, line := range got {
		if strings.Count(line, open) != 1 || strings.Count(line, close) != 1 {
			t.Fatalf("line %d does not contain one balanced true-color state: %q", i, line)
		}
	}
}

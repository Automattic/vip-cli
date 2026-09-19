package output

import (
	"regexp"
	"testing"
)

var ansiRe = regexp.MustCompile("\x1b\\[[0-9;]*m")

func stripANSI(s string) string { return ansiRe.ReplaceAllString(s, "") }

// The expected strings below were captured from the shipping Node CLI:
//
//	node -e "const {keyValue}=require('./dist/lib/cli/format.js');
//	         console.log(JSON.stringify(keyValue([...])))"
//
// KeyValue is the port of src/lib/cli/format.ts keyValue(). It is what
// src/lib/cli/prompt.ts confirm() console.logs above every requireConfirm
// yes/no prompt.

func TestKeyValueBlockMatchesNode(t *testing.T) {
	got := KeyValue([]Tuple{
		{Key: "App", Value: "my-app (id: 42)"},
		{Key: "Environment", Value: "develop (id: 7)"},
	})
	want := "===================================\n" +
		"+ App: my-app (id: 42)\n" +
		"+ Environment: develop (id: 7)\n" +
		"==================================="
	if got != want {
		t.Errorf("KeyValue mismatch\n got: %q\nwant: %q", got, want)
	}
}

// Node pushes the opening rule only when there is at least one pair, but
// always pushes the closing rule — so an empty list renders as a single
// 35-character rule (format.ts:112-132).
func TestKeyValueBlockEmptyIsSingleRule(t *testing.T) {
	got := KeyValue(nil)
	want := "==================================="
	if got != want {
		t.Errorf("KeyValue(nil) = %q, want %q", got, want)
	}
}

// keyValue() special-cases the literal key "environment" (case-insensitive)
// and runs the WHOLE value through formatEnvironment, which lowercases it.
// "Develop (id: 7)" therefore renders as "develop (id: 7)".
func TestKeyValueBlockLowercasesEnvironmentValue(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	got := KeyValue([]Tuple{{Key: "Environment", Value: "Develop (id: 7)"}})
	want := "===================================\n" +
		"+ Environment: develop (id: 7)\n" +
		"==================================="
	if got != want {
		t.Errorf("KeyValue mismatch\n got: %q\nwant: %q", got, want)
	}
}

// formatEnvironment only reddens+uppercases when the ENTIRE value equals
// "production". The confirm table's Environment value is "production (id: 1)",
// which does not match, so it stays lowercase like any other env.
func TestKeyValueBlockProductionRowIsNotUppercased(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	got := KeyValue([]Tuple{{Key: "Environment", Value: "production (id: 1)"}})
	want := "===================================\n" +
		"+ Environment: production (id: 1)\n" +
		"==================================="
	if got != want {
		t.Errorf("KeyValue mismatch\n got: %q\nwant: %q", got, want)
	}
}

// Node's table for the sync `Replacements` / import-sql `Replacements` rows
// comes from formatData(rows, 'table'), which returns the empty string for
// an empty slice and otherwise has NO trailing newline.
func TestNodeTableStringHasNoTrailingNewline(t *testing.T) {
	got := TableString(OrderedRows{
		{{Key: "from", Value: "a.com"}, {Key: "to", Value: "b.com"}},
	})
	want := "┌───────┬───────┐\n" +
		"│ from  │ to    │\n" +
		"├───────┼───────┤\n" +
		"│ a.com │ b.com │\n" +
		"└───────┴───────┘"
	if stripANSI(got) != want {
		t.Errorf("TableString mismatch\n got: %q\nwant: %q", stripANSI(got), want)
	}
}

func TestNodeTableStringEmptyIsEmpty(t *testing.T) {
	if got := TableString(OrderedRows{}); got != "" {
		t.Errorf("TableString(empty) = %q, want \"\"", got)
	}
}

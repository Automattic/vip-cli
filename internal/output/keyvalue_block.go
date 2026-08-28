package output

import (
	"bytes"
	"strings"

	"github.com/fatih/color"
)

// Tuple is Node's `Tuple` from src/lib/cli/format.ts — a key/value pair fed
// to keyValue(). Distinct from the OrderedRow/Cell shapes used by --format
// rendering: this one is the confirmation info-table payload.
type Tuple struct {
	Key   string
	Value string
}

// keyValueRule is Node's literal separator line (format.ts:116,130) — 35 '='.
const keyValueRule = "==================================="

// KeyValue ports keyValue() from src/lib/cli/format.ts.
//
//	===================================
//	+ App: my-app (id: 42)
//	+ Environment: develop (id: 7)
//	===================================
//
// Two Node details that are easy to get wrong and are pinned by tests:
//   - the OPENING rule is emitted only when there is at least one pair, but
//     the CLOSING rule is unconditional, so an empty list is a single rule;
//   - a row whose key is "environment" (case-insensitive) has its ENTIRE
//     value run through FormatEnvironment, which lowercases it. The confirm
//     table's value is "production (id: 1)", not "production", so it never
//     takes formatEnvironment's red/uppercase production branch.
//
// The returned string has no trailing newline (Node joins with '\n' and the
// caller console.logs it).
func KeyValue(values []Tuple) string {
	lines := make([]string, 0, len(values)+2)
	if len(values) > 0 {
		lines = append(lines, keyValueRule)
	}
	for _, v := range values {
		formatted := v.Value
		if strings.EqualFold(v.Key, "environment") {
			formatted = FormatEnvironment(v.Value)
		}
		lines = append(lines, "+ "+v.Key+": "+formatted)
	}
	lines = append(lines, keyValueRule)
	return strings.Join(lines, "\n")
}

// FormatEnvironment ports formatEnvironment() from src/lib/cli/format.ts:
// an exact (case-insensitive) "production" renders red + UPPERCASED,
// anything else renders bright-blue + lowercased. NO_COLOR and non-TTY
// stdout are honored by fatih/color, matching chalk.
func FormatEnvironment(environment string) string {
	if strings.EqualFold(environment, "production") {
		return color.RedString(strings.ToUpper(environment))
	}
	return color.HiBlueString(strings.ToLower(environment))
}

// TableString renders rows the way Node's formatData(rows, 'table') does and
// returns the result as a string: empty for no rows, and no trailing newline.
// Used for the `Replacements` cell inside a KeyValue info table.
func TableString(rows OrderedRows) string {
	if len(rows) == 0 {
		return ""
	}
	var buf bytes.Buffer
	if err := renderTable(&buf, rows); err != nil {
		return ""
	}
	return strings.TrimRight(buf.String(), "\n")
}

package output

import (
	"bytes"
	json "encoding/json/v2"
	"strings"
	"testing"
)

func TestRenderJSONControlCharacters(t *testing.T) {
	value := "safe\u007f\u009b[31m"
	for _, data := range []any{Rows{{"value": value}}, OrderedRows{{{Key: "value", Value: value}}}} {
		var buf bytes.Buffer
		if err := Render(&buf, FormatJSON, data); err != nil {
			t.Fatal(err)
		}
		if strings.ContainsAny(buf.String(), "\u007f\u009b") || !strings.Contains(buf.String(), `safe\u007f\u009b[31m`) {
			t.Fatalf("control bytes: %q", buf.String())
		}
		var decoded []map[string]string
		if err := json.Unmarshal(buf.Bytes(), &decoded); err != nil || decoded[0]["value"] != value {
			t.Fatalf("decoded %v (%v)", decoded, err)
		}
	}
}

func TestRenderJSONRows(t *testing.T) {
	data := Rows{
		{"id": 1, "name": "alpha"},
		{"id": 2, "name": "beta"},
	}
	var buf bytes.Buffer
	if err := Render(&buf, FormatJSON, data); err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := buf.String()
	if !strings.Contains(got, `"name": "alpha"`) || !strings.Contains(got, `"name": "beta"`) {
		t.Errorf("missing expected entries in JSON output: %q", got)
	}
}

func TestRenderJSONHeaderData(t *testing.T) {
	// Node parity: in JSON mode, command.js drops res.header entirely and
	// only emits res.data. See src/lib/cli/command.js — the keyValue header
	// print is gated on `options.format !== 'json'`, then `res = res.data`
	// runs unconditionally. So formatData never sees the header in JSON mode.
	data := HeaderData{
		Header: map[string]string{"app": "my-site"},
		Data:   Rows{{"id": 1}},
	}
	var buf bytes.Buffer
	if err := Render(&buf, FormatJSON, data); err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := buf.String()
	if strings.Contains(got, "__header") || strings.Contains(got, `"header"`) ||
		strings.Contains(got, "my-site") {
		t.Errorf("JSON HeaderData must drop header for Node parity; got:\n%s", got)
	}
	if !strings.Contains(got, `"id": 1`) {
		t.Errorf("JSON HeaderData must emit data payload; got:\n%s", got)
	}
}

func TestRenderJSONNilNoOutput(t *testing.T) {
	var buf bytes.Buffer
	if err := Render(&buf, FormatJSON, nil); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if buf.Len() != 0 {
		t.Errorf("nil data must produce no output, got %q", buf.String())
	}
}

func TestRenderRejectsUnknownFormat(t *testing.T) {
	var buf bytes.Buffer
	err := Render(&buf, Format("xml"), Rows{{"id": 1}})
	if err == nil {
		t.Fatal("expected error for unknown format")
	}
}

func TestRenderJSONHasTrailingNewline(t *testing.T) {
	var buf bytes.Buffer
	if err := Render(&buf, FormatJSON, Rows{{"id": 1}}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := buf.String()
	if len(got) == 0 || got[len(got)-1] != '\n' {
		t.Errorf("JSON output must end with newline; got: %q", got)
	}
}

func TestRenderCSVRows(t *testing.T) {
	data := Rows{
		{"id": 1, "name": "alpha"},
		{"id": 2, "name": "beta"},
	}
	var buf bytes.Buffer
	if err := Render(&buf, FormatCSV, data); err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := buf.String()
	wantHeader := `"id","name"`
	if !strings.HasPrefix(got, wantHeader) {
		t.Errorf("CSV must start with sorted header %q, got %q", wantHeader, got)
	}
	if !strings.Contains(got, `1,"alpha"`) || !strings.Contains(got, `2,"beta"`) {
		t.Errorf("CSV output missing rows: %q", got)
	}
}

func TestRenderCSVMatchesNodeTypedQuoting(t *testing.T) {
	var buf bytes.Buffer
	rows := OrderedRows{
		{
			{Key: "appId", Value: 7},
			{Key: "name", Value: "alpha"},
			{Key: "active", Value: true},
			{Key: "empty", Value: nil},
		},
	}
	if err := Render(&buf, FormatCSV, rows); err != nil {
		t.Fatalf("Render: %v", err)
	}
	want := "\"app id\",\"name\",\"active\",\"empty\"\n7,\"alpha\",true,\n"
	if got := buf.String(); got != want {
		t.Fatalf("csv = %q, want %q", got, want)
	}
}

func TestRenderCSVEscapesQuotesLikeJSON2CSV(t *testing.T) {
	var buf bytes.Buffer
	rows := OrderedRows{
		{{Key: "value", Value: "a\"b"}},
	}
	if err := Render(&buf, FormatCSV, rows); err != nil {
		t.Fatalf("Render: %v", err)
	}
	want := "\"value\"\n\"a\"\"b\"\n"
	if got := buf.String(); got != want {
		t.Fatalf("csv = %q, want %q", got, want)
	}
}

func TestRenderCSVHeaderDataPrintsHeaderLines(t *testing.T) {
	data := HeaderData{
		Header: map[string]string{"app": "my-site", "env": "staging"},
		Data:   Rows{{"id": 1, "name": "alpha"}},
	}
	var buf bytes.Buffer
	if err := Render(&buf, FormatCSV, data); err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := buf.String()
	if !strings.Contains(got, "# app: my-site") {
		t.Errorf("HeaderData CSV missing header comment for app: %q", got)
	}
	if !strings.Contains(got, "# env: staging") {
		t.Errorf("HeaderData CSV missing header comment for env: %q", got)
	}
}

func TestRenderTableRows(t *testing.T) {
	data := Rows{
		{"id": 1, "name": "alpha"},
		{"id": 2, "name": "beta"},
	}
	var buf bytes.Buffer
	if err := Render(&buf, FormatTable, data); err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := buf.String()
	for _, want := range []string{"id", "name", "alpha", "beta"} {
		if !strings.Contains(got, want) {
			t.Errorf("table output missing %q:\n%s", want, got)
		}
	}
}

// A bytes.Buffer is not a terminal, so this pins the shape a redirect, a pipe,
// a cron job or `docker exec` sees. Node clears cli-table3's head and border
// styles in exactly that situation (src/bin/vip-logs.js:171-172, and via the
// colour layer's own TTY detection for src/lib/cli/format.ts `table()`), so
// there are no escape bytes anywhere in the frame.
func TestRenderTableOrderedRowsNonTTYMatchesNodeCLI(t *testing.T) {
	rows := OrderedRows{
		{{Key: "id", Value: 1}, {Key: "appId", Value: 1}, {Key: "name", Value: "alpha"}},
		{{Key: "id", Value: 20}, {Key: "appId", Value: 20}, {Key: "name", Value: "beta"}},
	}
	var buf bytes.Buffer
	if err := Render(&buf, FormatTable, rows); err != nil {
		t.Fatal(err)
	}
	want := "┌────┬────────┬───────┐\n" +
		"│ id │ app id │ name  │\n" +
		"├────┼────────┼───────┤\n" +
		"│ 1  │ 1      │ alpha │\n" +
		"├────┼────────┼───────┤\n" +
		"│ 20 │ 20     │ beta  │\n" +
		"└────┴────────┴───────┘\n"
	if got := buf.String(); got != want {
		t.Fatalf("table diff\nwant: %q\n got: %q", want, got)
	}
	if strings.Contains(buf.String(), "\x1b[") {
		t.Errorf("non-TTY table carries ANSI:\n%q", buf.String())
	}
}

// The terminal shape is unchanged: grey borders, bright-blue head.
func TestRenderTableOrderedRowsTTYMatchesNodeCLI(t *testing.T) {
	headers := []string{"id", "app id", "name"}
	rows := [][]string{{"1", "1", "alpha"}, {"20", "20", "beta"}}

	var buf bytes.Buffer
	if err := renderNodeTableStyled(&buf, headers, rows, 0, true); err != nil {
		t.Fatal(err)
	}
	want := "\x1b[90m┌────\x1b[39m\x1b[90m┬────────\x1b[39m\x1b[90m┬───────┐\x1b[39m\n" +
		"\x1b[90m│\x1b[39m\x1b[94m id \x1b[39m\x1b[90m│\x1b[39m\x1b[94m app id \x1b[39m\x1b[90m│\x1b[39m\x1b[94m name  \x1b[39m\x1b[90m│\x1b[39m\n" +
		"\x1b[90m├────\x1b[39m\x1b[90m┼────────\x1b[39m\x1b[90m┼───────┤\x1b[39m\n" +
		"\x1b[90m│\x1b[39m 1  \x1b[90m│\x1b[39m 1      \x1b[90m│\x1b[39m alpha \x1b[90m│\x1b[39m\n" +
		"\x1b[90m├────\x1b[39m\x1b[90m┼────────\x1b[39m\x1b[90m┼───────┤\x1b[39m\n" +
		"\x1b[90m│\x1b[39m 20 \x1b[90m│\x1b[39m 20     \x1b[90m│\x1b[39m beta  \x1b[90m│\x1b[39m\n" +
		"\x1b[90m└────\x1b[39m\x1b[90m┴────────\x1b[39m\x1b[90m┴───────┘\x1b[39m\n"
	if got := buf.String(); got != want {
		t.Fatalf("table diff\nwant: %q\n got: %q", want, got)
	}
}

// Clearing the head/border styles must not touch ANSI that came in with the
// DATA — Node clears styles, it does not strip cells.
func TestRenderTableMultilineAndANSIMatchesNodeCLI(t *testing.T) {
	rows := OrderedRows{
		{{Key: "id", Value: 1}, {Key: "value", Value: "a\nb"}},
		{{Key: "id", Value: 2}, {Key: "value", Value: "\x1b[31mred\x1b[39m"}},
	}
	var buf bytes.Buffer
	if err := Render(&buf, FormatTable, rows); err != nil {
		t.Fatal(err)
	}
	want := "┌────┬───────┐\n" +
		"│ id │ value │\n" +
		"├────┼───────┤\n" +
		"│ 1  │ a     │\n" +
		"│    │ b     │\n" +
		"├────┼───────┤\n" +
		"│ 2  │ \x1b[31mred\x1b[39m   │\n" +
		"└────┴───────┘\n"
	if got := buf.String(); got != want {
		t.Fatalf("table diff\nwant: %q\n got: %q", want, got)
	}
}

func TestRenderTableAtWidthWrapsLongLogMessageWithoutWrappingBorders(t *testing.T) {
	headers := []string{"timestamp", "message"}
	message := "PHP message: [ERROR] Permission denied for MCP API access. User ID 0 does not have capability read."
	rows := [][]string{{"2026-07-15T07:17:38.002797318Z", message}}

	var buf bytes.Buffer
	if err := renderNodeTableAtWidth(&buf, headers, rows, 78); err != nil {
		t.Fatal(err)
	}
	for lineNumber, line := range strings.Split(strings.TrimSuffix(buf.String(), "\n"), "\n") {
		if width := nodeDisplayWidth(line); width > 78 {
			t.Fatalf("line %d width = %d, want <= 78: %q", lineNumber+1, width, line)
		}
	}
	for _, word := range strings.Fields(message) {
		if !strings.Contains(stripNodeANSI(buf.String()), word) {
			t.Fatalf("rendered table lost message word %q:\n%s", word, buf.String())
		}
	}
}

func TestRenderNodeTableNonTTYKeepsNaturalWidth(t *testing.T) {
	headers := []string{"timestamp", "message"}
	rows := [][]string{{"2026-07-15T07:17:38.002797318Z", strings.Repeat("wide ", 30)}}

	var buf bytes.Buffer
	if err := renderNodeTable(&buf, headers, rows); err != nil {
		t.Fatal(err)
	}
	if width := nodeDisplayWidth(strings.Split(buf.String(), "\n")[0]); width <= 78 {
		t.Fatalf("non-TTY natural table width = %d, want > 78", width)
	}
}

func TestRenderNodeTableNonTTYDoesNotRewriteANSIStateAcrossExplicitLines(t *testing.T) {
	headers := []string{"value"}
	rows := [][]string{{"\x1b[31malpha\nbeta\x1b[39m"}}

	var buf bytes.Buffer
	if err := renderNodeTable(&buf, headers, rows); err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(buf.String(), "\x1b[31m"); got != 1 {
		t.Fatalf("non-TTY renderer wrote red foreground %d times, want original byte sequence once: %q", got, buf.String())
	}
}

func TestNodeDisplayWidthMatchesNodeStripANSICompatibility(t *testing.T) {
	tests := map[string]struct {
		value string
		want  int
	}{
		"SGR color": {
			value: "\x1b[31mred\x1b[39m",
			want:  3,
		},
		"OSC hyperlink with ansi-regex v5 behavior": {
			value: "\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\",
			want:  26,
		},
	}
	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			if got := nodeDisplayWidth(test.value); got != test.want {
				t.Fatalf("nodeDisplayWidth() = %d, want %d", got, test.want)
			}
		})
	}
}

func TestRenderTableHeaderDataPrintsHeaderBlock(t *testing.T) {
	data := HeaderData{
		Header: map[string]string{"app": "my-site"},
		Data:   Rows{{"id": 1}},
	}
	var buf bytes.Buffer
	if err := Render(&buf, FormatTable, data); err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := buf.String()
	if !strings.Contains(got, "app: my-site") {
		t.Errorf("header block missing: %q", got)
	}
	if !strings.Contains(got, "id") {
		t.Errorf("table missing after header block: %q", got)
	}
}

func TestRenderTableHeaderDataWithOrderedRows(t *testing.T) {
	var buf bytes.Buffer
	hd := HeaderData{
		Header: map[string]string{"id": "42", "name": "myapp"},
		Data: OrderedRows{
			{{Key: "envid", Value: 7}, {Key: "envname", Value: "develop"}},
		},
	}
	if err := Render(&buf, FormatTable, hd); err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := buf.String()
	for _, want := range []string{"id: 42", "name: myapp", "develop"} {
		if !strings.Contains(got, want) {
			t.Errorf("table HeaderData output missing %q in:\n%s", want, got)
		}
	}
}

func TestRenderJSONOrderedRowsPreservesKeyOrder(t *testing.T) {
	// Node parity: JSON.stringify of an array of objects emits objects with
	// keys in insertion order, e.g. [{"zeta":1,"alpha":2}]. The Cell struct
	// shape ({"Key":..., "Value":...}) must NOT leak into output.
	var buf bytes.Buffer
	rows := OrderedRows{
		{{Key: "zeta", Value: 1}, {Key: "alpha", Value: 2}},
	}
	if err := Render(&buf, FormatJSON, rows); err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := buf.String()
	if strings.Contains(got, `"Key"`) || strings.Contains(got, `"Value"`) {
		t.Fatalf("Cell struct fields must not leak into JSON; got:\n%s", got)
	}
	zetaIdx := strings.Index(got, `"zeta"`)
	alphaIdx := strings.Index(got, `"alpha"`)
	if zetaIdx < 0 || alphaIdx < 0 {
		t.Fatalf("missing keys in output: %q", got)
	}
	if zetaIdx > alphaIdx {
		t.Errorf("OrderedRows must preserve insertion order; got:\n%s", got)
	}
}

func TestRenderCSVOrderedRows(t *testing.T) {
	var buf bytes.Buffer
	rows := OrderedRows{
		{{Key: "id", Value: 1}, {Key: "name", Value: "a"}},
		{{Key: "id", Value: 2}, {Key: "name", Value: "b"}},
	}
	if err := Render(&buf, FormatCSV, rows); err != nil {
		t.Fatalf("Render: %v", err)
	}
	want := "\"id\",\"name\"\n1,\"a\"\n2,\"b\"\n"
	if buf.String() != want {
		t.Errorf("csv OrderedRows = %q, want %q", buf.String(), want)
	}
}

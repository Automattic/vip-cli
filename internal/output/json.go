package output

import (
	"bytes"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"fmt"
	"io"
	"strings"
)

// renderJSON writes data as tab-indented JSON via encoding/json/v2.
// Indent is "\t" to match Node's JSON.stringify(data, null, '\t')
// in src/lib/cli/format.ts. A trailing newline is appended to match
// Node's console.log behavior.
//
// HeaderData is rendered as just the data payload (the header is
// dropped) to match Node's command.js, where the keyValue header print
// is gated on `options.format !== 'json'` and then `res = res.data`
// runs unconditionally — so formatData never sees the header in JSON
// mode.
//
// OrderedRows is hand-emitted to preserve column insertion order;
// encoding/json/v2 would alphabetize map keys, matching Node's
// JSON.stringify(arrayOfObjects) insertion-order behavior.
func renderJSON(w io.Writer, data any) error {
	var encoded bytes.Buffer
	switch v := data.(type) {
	case HeaderData:
		// Node parity: drop header in JSON mode; emit only the data payload.
		return renderJSON(w, v.Data)
	case OrderedRows:
		if err := writeOrderedRowsJSON(&encoded, v); err != nil {
			return err
		}
	default:
		opts := []json.Options{
			json.Deterministic(true),
			jsontext.WithIndent("\t"),
		}
		if err := json.MarshalWrite(&encoded, data, opts...); err != nil {
			return err
		}
	}
	// Node's formatData escapes DEL/C1 after JSON.stringify. Preserve the
	// decoded values while preventing terminal control bytes in JSON output.
	var safe strings.Builder
	for _, r := range encoded.String() {
		if r >= 0x7f && r <= 0x9f {
			fmt.Fprintf(&safe, `\u%04x`, r)
		} else {
			safe.WriteRune(r)
		}
	}
	safe.WriteByte('\n')
	_, err := io.WriteString(w, safe.String())
	return err
}

// writeOrderedRowsJSON hand-emits OrderedRows as a JSON array of
// objects with insertion-ordered keys, matching Node's
// JSON.stringify(arrayOfObjects, null, '\t') output.
//
// We hand-roll because encoding/json/v2 sorts map keys alphabetically,
// and a slice of Cell structs would marshal as
// [[{"Key":..., "Value":...}, ...], ...] — wrong shape entirely.
func writeOrderedRowsJSON(w io.Writer, rows OrderedRows) error {
	if len(rows) == 0 {
		_, err := io.WriteString(w, "[]")
		return err
	}

	var buf bytes.Buffer
	buf.WriteString("[\n")
	for i, row := range rows {
		buf.WriteString("\t{")
		if len(row) > 0 {
			buf.WriteByte('\n')
		}
		for j, cell := range row {
			keyJSON, err := json.Marshal(cell.Key)
			if err != nil {
				return err
			}
			valJSON, err := json.Marshal(cell.Value)
			if err != nil {
				return err
			}
			buf.WriteString("\t\t")
			buf.Write(keyJSON)
			buf.WriteString(": ")
			buf.Write(valJSON)
			if j < len(row)-1 {
				buf.WriteByte(',')
			}
			buf.WriteByte('\n')
		}
		if len(row) > 0 {
			buf.WriteString("\t")
		}
		buf.WriteByte('}')
		if i < len(rows)-1 {
			buf.WriteByte(',')
		}
		buf.WriteByte('\n')
	}
	buf.WriteByte(']')

	if _, err := w.Write(buf.Bytes()); err != nil {
		return fmt.Errorf("write OrderedRows JSON: %w", err)
	}
	return nil
}

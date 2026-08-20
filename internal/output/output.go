// Package output renders command results in table, CSV, or JSON.
//
// Handlers return one of:
//   - HeaderData{Header, Data}  — printed as a key:value block followed by formatted data
//   - Rows                      — printed as table/csv/json
//   - nil                       — no output
//
// The format is selected by --format on commands that opt in via the
// WithFormat middleware. See spec §6.1.
package output

import (
	"fmt"
	"io"
)

// Format is the output format requested by --format.
type Format string

const (
	FormatTable    Format = "table"
	FormatCSV      Format = "csv"
	FormatJSON     Format = "json"
	FormatText     Format = "text"
	FormatKeyValue Format = "keyValue"
	FormatIDs      Format = "ids"
)

// Rows is a slice of string-keyed maps, the primary tabular return type from
// command handlers.
type Rows []map[string]any

// HeaderData wraps a key/value header section and a data payload. The header
// is rendered above the data (table/csv) or as "__header" (json).
type HeaderData struct {
	Header map[string]string
	Data   any
}

// Render dispatches data to the appropriate renderer for format f.
// If data is nil, Render returns immediately without writing anything.
func Render(w io.Writer, f Format, data any) error {
	if data == nil {
		return nil
	}
	switch f {
	case FormatJSON:
		return renderJSON(w, data)
	case FormatCSV:
		return renderCSV(w, data)
	case FormatText:
		return renderText(w, data)
	case FormatKeyValue:
		return renderKeyValue(w, data)
	case FormatIDs:
		return renderIDs(w, data)
	case FormatTable, "":
		return renderTable(w, data)
	default:
		return fmt.Errorf("unknown output format %q (want table, csv, json, text, keyValue, or ids)", f)
	}
}

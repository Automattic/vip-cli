package output

import (
	"fmt"
	"io"
)

// renderKeyValue handles two row shapes:
//   - single-column: {Key: "MY_VAR", Value: "1"} -> "MY_VAR=1"
//   - two-column with literal headers: {key: MY_VAR, value: 1} -> "MY_VAR=1"
//
// The two-column form is how envvar get-all formats output when --format=keyValue.
func renderKeyValue(w io.Writer, data any) error {
	rows, ok := data.(OrderedRows)
	if !ok {
		return fmt.Errorf("keyValue renderer requires OrderedRows, got %T", data)
	}
	for _, r := range rows {
		k, v := pickKeyValuePair(r)
		if _, err := fmt.Fprintf(w, "%v=%v\n", k, v); err != nil {
			return err
		}
	}
	return nil
}

func pickKeyValuePair(r OrderedRow) (any, any) {
	if len(r) == 2 && r[0].Key == "key" && r[1].Key == "value" {
		return r[0].Value, r[1].Value
	}
	if len(r) >= 1 {
		return r[0].Key, r[0].Value
	}
	return "", ""
}

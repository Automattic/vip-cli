package output

import (
	"fmt"
	"io"
	"strings"
)

func renderText(w io.Writer, data any) error {
	rows, ok := data.(OrderedRows)
	if !ok {
		return fmt.Errorf("text renderer requires OrderedRows, got %T", data)
	}
	for _, r := range rows {
		parts := make([]string, 0, len(r))
		for _, c := range r {
			parts = append(parts, fmt.Sprint(c.Value))
		}
		if _, err := fmt.Fprintln(w, strings.Join(parts, " ")); err != nil {
			return err
		}
	}
	return nil
}

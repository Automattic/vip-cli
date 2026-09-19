package output

import (
	"fmt"
	"io"
	"strings"
)

func renderIDs(w io.Writer, data any) error {
	rows, ok := data.(OrderedRows)
	if !ok {
		return fmt.Errorf("ids renderer requires OrderedRows, got %T", data)
	}
	if len(rows) == 0 {
		return nil
	}
	parts := make([]string, 0, len(rows))
	for _, r := range rows {
		if len(r) == 0 {
			continue
		}
		parts = append(parts, fmt.Sprint(r[0].Value))
	}
	_, err := fmt.Fprintln(w, strings.Join(parts, " "))
	return err
}

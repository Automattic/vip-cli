package output

import (
	json "encoding/json/v2"
	"fmt"
	"io"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

func renderCSV(w io.Writer, data any) error {
	switch v := data.(type) {
	case HeaderData:
		keys := make([]string, 0, len(v.Header))
		for k := range v.Header {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if _, err := fmt.Fprintf(w, "# %s: %s\n", k, v.Header[k]); err != nil {
				return err
			}
		}
		return renderCSVRows(w, v.Data)
	default:
		return renderCSVRows(w, data)
	}
}

func renderCSVRows(w io.Writer, data any) error {
	switch v := data.(type) {
	case Rows:
		return renderCSVMapRows(w, v)
	case OrderedRows:
		return renderCSVOrderedRows(w, v)
	default:
		return fmt.Errorf("CSV renderer requires Rows or OrderedRows, got %T", data)
	}
}

func renderCSVMapRows(w io.Writer, rows Rows) error {
	if len(rows) == 0 {
		return nil
	}

	// Stable column order: sorted union of keys across rows.
	colset := map[string]struct{}{}
	for _, r := range rows {
		for k := range r {
			colset[k] = struct{}{}
		}
	}
	cols := make([]string, 0, len(colset))
	for k := range colset {
		cols = append(cols, k)
	}
	sort.Strings(cols)

	if err := writeCSVHeader(w, cols); err != nil {
		return err
	}
	for _, r := range rows {
		rec := make([]any, len(cols))
		for i, c := range cols {
			if v, ok := r[c]; ok {
				rec[i] = v
			}
		}
		if err := writeCSVValues(w, rec); err != nil {
			return err
		}
	}
	return nil
}

func renderCSVOrderedRows(w io.Writer, rows OrderedRows) error {
	if len(rows) == 0 {
		return nil
	}

	cols := rows.Columns()
	if err := writeCSVHeader(w, cols); err != nil {
		return err
	}
	for _, r := range rows {
		rec := make([]any, len(cols))
		for i, c := range cols {
			rec[i] = r.ValueAt(c)
		}
		if err := writeCSVValues(w, rec); err != nil {
			return err
		}
	}
	return nil
}

func writeCSVHeader(w io.Writer, columns []string) error {
	values := make([]string, len(columns))
	for i, column := range columns {
		values[i] = quoteCSVString(HumanizeField(column))
	}
	return writeCSVLine(w, values)
}

func writeCSVValues(w io.Writer, values []any) error {
	encoded := make([]string, len(values))
	for i, value := range values {
		cell, err := encodeCSVValue(value)
		if err != nil {
			return fmt.Errorf("encode CSV value in column %d: %w", i, err)
		}
		encoded[i] = cell
	}
	return writeCSVLine(w, encoded)
}

func writeCSVLine(w io.Writer, values []string) error {
	_, err := io.WriteString(w, strings.Join(values, ",")+"\n")
	return err
}

func encodeCSVValue(value any) (string, error) {
	if value == nil {
		return "", nil
	}
	switch v := value.(type) {
	case string:
		return quoteCSVString(v), nil
	case bool:
		return strconv.FormatBool(v), nil
	case int:
		return strconv.FormatInt(int64(v), 10), nil
	case int8:
		return strconv.FormatInt(int64(v), 10), nil
	case int16:
		return strconv.FormatInt(int64(v), 10), nil
	case int32:
		return strconv.FormatInt(int64(v), 10), nil
	case int64:
		return strconv.FormatInt(v, 10), nil
	case uint:
		return strconv.FormatUint(uint64(v), 10), nil
	case uint8:
		return strconv.FormatUint(uint64(v), 10), nil
	case uint16:
		return strconv.FormatUint(uint64(v), 10), nil
	case uint32:
		return strconv.FormatUint(uint64(v), 10), nil
	case uint64:
		return strconv.FormatUint(v, 10), nil
	case float32:
		return strconv.FormatFloat(float64(v), 'g', -1, 32), nil
	case float64:
		return strconv.FormatFloat(v, 'g', -1, 64), nil
	}

	rv := reflect.ValueOf(value)
	if rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return "", nil
		}
		return encodeCSVValue(rv.Elem().Interface())
	}
	if rv.Kind() == reflect.Map || rv.Kind() == reflect.Slice || rv.Kind() == reflect.Array || rv.Kind() == reflect.Struct {
		encoded, err := json.Marshal(value)
		if err != nil {
			return "", err
		}
		return quoteCSVString(string(encoded)), nil
	}
	return quoteCSVString(fmt.Sprint(value)), nil
}

func quoteCSVString(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

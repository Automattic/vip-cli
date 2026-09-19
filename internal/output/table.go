package output

import (
	"fmt"
	"io"
	"sort"
	"strings"
)

const (
	ansiGray       = "\x1b[90m"
	ansiBrightBlue = "\x1b[94m"
	ansiFgClose    = "\x1b[39m"
)

func renderTable(w io.Writer, data any) error {
	switch v := data.(type) {
	case HeaderData:
		keys := make([]string, 0, len(v.Header))
		for k := range v.Header {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if _, err := fmt.Fprintf(w, "%s: %s\n", k, v.Header[k]); err != nil {
				return err
			}
		}
		if _, err := io.WriteString(w, "\n"); err != nil {
			return err
		}
		return renderTableRows(w, v.Data)
	default:
		return renderTableRows(w, data)
	}
}

func renderTableRows(w io.Writer, data any) error {
	switch v := data.(type) {
	case Rows:
		return renderTableMapRows(w, v)
	case OrderedRows:
		return renderTableOrderedRows(w, v)
	default:
		return fmt.Errorf("table renderer requires Rows or OrderedRows, got %T", data)
	}
}

func renderTableMapRows(w io.Writer, rows Rows) error {
	if len(rows) == 0 {
		return nil
	}

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

	headers := make([]string, len(cols))
	for i, c := range cols {
		headers[i] = HumanizeField(c)
	}
	values := make([][]string, len(rows))
	for rowIndex, r := range rows {
		values[rowIndex] = make([]string, len(cols))
		for columnIndex, c := range cols {
			if v, ok := r[c]; ok {
				values[rowIndex][columnIndex] = nodeCell(v)
			}
		}
	}
	return renderNodeTable(w, headers, values)
}

func renderTableOrderedRows(w io.Writer, rows OrderedRows) error {
	if len(rows) == 0 {
		return nil
	}

	cols := rows.Columns()
	headers := make([]string, len(cols))
	for i, c := range cols {
		headers[i] = HumanizeField(c)
	}
	values := make([][]string, len(rows))
	for rowIndex, r := range rows {
		values[rowIndex] = make([]string, len(cols))
		for i, c := range cols {
			values[rowIndex][i] = nodeCell(r.ValueAt(c))
		}
	}
	return renderNodeTable(w, headers, values)
}

func nodeCell(value any) string {
	if value == nil {
		return ""
	}
	return fmt.Sprint(value)
}

func renderNodeTable(w io.Writer, headers []string, rows [][]string) error {
	return renderNodeTableStyled(w, headers, rows, terminalTableWidth(w), terminalTableIsTTY(w))
}

// renderNodeTableAtWidth renders at an explicit width with colour ON. It is
// the shape a real terminal gets, and exists so tests can pin that shape
// without a pty.
func renderNodeTableAtWidth(w io.Writer, headers []string, rows [][]string, maxTableWidth int) error {
	return renderNodeTableStyled(w, headers, rows, maxTableWidth, true)
}

// renderNodeTableStyled is the single renderer. `colorize` corresponds to
// cli-table3's style.head/style.border being populated, which the Node CLI
// only does when stdout is a TTY — see terminalTableIsTTY.
//
// Note the cells themselves are NOT stripped: a value that already carries
// ANSI (a coloured environment name, say) keeps it, exactly as it would in
// Node, where only the head/border STYLES are cleared.
func renderNodeTableStyled(w io.Writer, headers []string, rows [][]string, maxTableWidth int, colorize bool) error {
	if len(headers) == 0 {
		return nil
	}
	wrapCells := maxTableWidth > 0 && nodeTableWidth(nodeNaturalColumnWidths(headers, rows)) > maxTableWidth
	widths := nodeColumnWidths(headers, rows, maxTableWidth)
	if err := writeNodeBorder(w, "┌", "┬", "┐", widths, colorize); err != nil {
		return err
	}
	if err := writeNodeRow(w, headers, widths, true, wrapCells, colorize); err != nil {
		return err
	}
	if err := writeNodeBorder(w, "├", "┼", "┤", widths, colorize); err != nil {
		return err
	}
	for i, row := range rows {
		if err := writeNodeRow(w, row, widths, false, wrapCells, colorize); err != nil {
			return err
		}
		if i < len(rows)-1 {
			if err := writeNodeBorder(w, "├", "┼", "┤", widths, colorize); err != nil {
				return err
			}
		}
	}
	return writeNodeBorder(w, "└", "┴", "┘", widths, colorize)
}

func writeNodeBorder(w io.Writer, left, middle, right string, widths []int, colorize bool) error {
	for i, width := range widths {
		start := middle
		if i == 0 {
			start = left
		}
		end := ""
		if i == len(widths)-1 {
			end = right
		}
		segment := start + strings.Repeat("─", width+2) + end
		if _, err := io.WriteString(w, colorText(ansiGray, segment, colorize)); err != nil {
			return err
		}
	}
	_, err := io.WriteString(w, "\n")
	return err
}

func writeNodeRow(w io.Writer, values []string, widths []int, header, wrapCells, colorize bool) error {
	lines := make([][]string, len(values))
	height := 1
	for i, value := range values {
		if wrapCells {
			lines[i] = wrapNodeCell(value, widths[i])
		} else {
			lines[i] = strings.Split(value, "\n")
		}
		if len(lines[i]) > height {
			height = len(lines[i])
		}
	}
	for lineIndex := 0; lineIndex < height; lineIndex++ {
		physical := make([]string, len(values))
		for columnIndex := range values {
			if lineIndex < len(lines[columnIndex]) {
				physical[columnIndex] = lines[columnIndex][lineIndex]
			}
		}
		if err := writeNodePhysicalRow(w, physical, widths, header, colorize); err != nil {
			return err
		}
	}
	return nil
}

func writeNodePhysicalRow(w io.Writer, values []string, widths []int, header, colorize bool) error {
	for i, value := range values {
		if _, err := io.WriteString(w, colorText(ansiGray, "│", colorize)); err != nil {
			return err
		}
		cell := padNodeCell(value, widths[i])
		if header {
			cell = colorText(ansiBrightBlue, cell, colorize)
		}
		if _, err := io.WriteString(w, cell); err != nil {
			return err
		}
	}
	_, err := io.WriteString(w, colorText(ansiGray, "│", colorize)+"\n")
	return err
}

func padNodeCell(value string, width int) string {
	return " " + value + strings.Repeat(" ", width-nodeDisplayWidth(value)+1)
}

// colorText wraps value in an SGR pair, or returns it untouched when the
// destination is not a terminal. Returning the bare string (rather than an
// empty escape pair) matters: the differential compares byte-for-byte against
// Node, whose cleared style produces no escape bytes at all.
func colorText(open, value string, colorize bool) string {
	if !colorize {
		return value
	}
	return open + value + ansiFgClose
}

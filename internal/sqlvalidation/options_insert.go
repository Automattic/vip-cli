package sqlvalidation

import (
	"regexp"
	"strings"
)

// optionsInsertScanner follows the options INSERT currently being read. It
// keeps unfinished tuples so that values split across lines are matched once.
type optionsInsertScanner struct {
	table             string
	columns           []string
	columnBuffer      string
	collectingColumns bool
	rowBuffer         string
	hasValues         bool
	valuesFinished    bool
	blockComment      bool
	quote             byte
}

var insertHeader = regexp.MustCompile("(?i)^\\s*(?:INSERT|REPLACE)\\b(?:\\s+(?:IGNORE|LOW_PRIORITY|DELAYED|HIGH_PRIORITY|INTO)\\b)*\\s+(`[^`]+`|[a-z0-9_$]+)(?:\\s*\\.\\s*(`[^`]+`|[a-z0-9_$]+))?")
var optionsTable = regexp.MustCompile(`(?i)^wp_(?:[0-9]+_)?options$`)
var valuesKeyword = regexp.MustCompile(`(?i)^values?\b`)

func escapedQuote(s string, i int) bool {
	n := 0
	for i--; i >= 0 && s[i] == '\\'; i-- {
		n++
	}
	return n%2 != 0
}

func skipQuoted(s string, i int) int {
	quote := s[i]
	for j := i + 1; j < len(s); j++ {
		if s[j] != quote || (quote != '`' && escapedQuote(s, j)) {
			continue
		}
		if j+1 < len(s) && s[j+1] == quote {
			j++
			continue
		}
		return j + 1
	}
	return len(s)
}

func (s *optionsInsertScanner) uncomment(line string) string {
	var out strings.Builder
	for i := 0; i < len(line); {
		if s.blockComment {
			end := strings.Index(line[i:], "*/")
			if end < 0 {
				return strings.TrimRight(out.String(), " \t\r\n")
			}
			s.blockComment = false
			i += end + 2
			if out.Len() == 0 {
				for i < len(line) && (line[i] == ' ' || line[i] == '\t') {
					i++
				}
			}
			continue
		}
		if s.quote != 0 {
			next := strings.IndexByte(line[i:], s.quote)
			if next < 0 {
				out.WriteString(line[i:])
				break
			}
			next += i
			out.WriteString(line[i : next+1])
			i = next
			if !escapedQuote(line, i) {
				if i+1 < len(line) && line[i+1] == s.quote {
					i++
					out.WriteByte(line[i])
				} else {
					s.quote = 0
				}
			}
			i++
			continue
		}
		if line[i] == '\'' || line[i] == '"' {
			s.quote = line[i]
			out.WriteByte(line[i])
			i++
			continue
		}
		if line[i] == '#' || (strings.HasPrefix(line[i:], "--") && (i+2 == len(line) || strings.ContainsRune(" \t\r\n", rune(line[i+2])))) {
			return strings.TrimRight(out.String(), " \t\r\n")
		}
		if strings.HasPrefix(line[i:], "/*") {
			s.blockComment = true
			i += 2
			continue
		}
		next := strings.IndexAny(line[i+1:], "'\"#/-")
		if next < 0 {
			out.WriteString(line[i:])
			break
		}
		next += i + 1
		out.WriteString(line[i:next])
		i = next
	}
	if s.blockComment {
		return strings.TrimRight(out.String(), " \t\r\n")
	}
	return out.String()
}

func findValues(line string) (int, int) {
	for i := 0; i < len(line); i++ {
		if strings.ContainsRune("'\"`", rune(line[i])) {
			i = skipQuoted(line, i) - 1
			continue
		}
		if i > 0 && isIdent(line[i-1]) {
			continue
		}
		if loc := valuesKeyword.FindStringIndex(line[i:]); loc != nil {
			end := i + loc[1]
			if end == len(line) || !isIdent(line[end]) {
				return i, end
			}
		}
	}
	return -1, -1
}

func isIdent(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '$'
}

func parseColumns(text string) []string {
	var cols []string
	for _, col := range strings.Split(text, ",") {
		col = strings.ToLower(strings.Trim(strings.TrimSpace(col), "`"))
		if col != "" {
			cols = append(cols, col)
		}
	}
	return cols
}

func parseRows(input string) ([][]string, string, bool) {
	var rows [][]string
	var row []string
	var value strings.Builder
	depth, start := 0, -1
	var quote byte
	for i := 0; i < len(input); i++ {
		c := input[i]
		if depth == 0 && quote == 0 && !strings.ContainsRune(" \t\r\n,(", rune(c)) {
			return rows, "", true
		}
		if quote != 0 {
			value.WriteByte(c)
			if c == quote && !escapedQuote(input, i) {
				if i+1 < len(input) && input[i+1] == quote {
					i++
					value.WriteByte(input[i])
				} else {
					quote = 0
				}
			}
			continue
		}
		if c == '\'' || c == '"' {
			quote = c
			value.WriteByte(c)
			continue
		}
		if c == '(' {
			if depth == 0 {
				row = nil
				value.Reset()
				start = i
			} else {
				value.WriteByte(c)
			}
			depth++
			continue
		}
		if c == ')' && depth > 0 {
			depth--
			if depth == 0 {
				row = append(row, strings.TrimSpace(value.String()))
				rows = append(rows, row)
				value.Reset()
				start = -1
				continue
			}
		}
		if c == ',' && depth == 1 {
			row = append(row, strings.TrimSpace(value.String()))
			value.Reset()
			continue
		}
		if depth > 0 {
			value.WriteByte(c)
		}
	}
	if start >= 0 {
		return rows, input[start:], false
	}
	return rows, "", false
}

func unquoteSQL(value string) string {
	value = strings.TrimSpace(value)
	if len(value) < 2 || (value[0] != '\'' && value[0] != '"') || value[len(value)-1] != value[0] {
		return value
	}
	q := value[:1]
	return strings.ReplaceAll(strings.ReplaceAll(value[1:len(value)-1], q+q, q), "\\"+q, q)
}

func (s *optionsInsertScanner) scan(line string) [][]string {
	// A block opener can appear after unrelated SQL and hide a later INSERT.
	wasInQuotedValue := s.quote != 0
	if s.blockComment || s.quote != 0 || strings.Contains(line, "/*") || s.table != "" || insertHeader.MatchString(line) {
		line = s.uncomment(line)
	}
	if match := insertHeader.FindStringSubmatchIndex(line); match != nil && !wasInQuotedValue {
		name := line[match[2]:match[3]]
		if match[4] >= 0 {
			name = line[match[4]:match[5]]
		}
		s.table = strings.Trim(name, "`")
		s.columns, s.columnBuffer, s.rowBuffer, s.hasValues, s.collectingColumns = nil, "", "", false, false
		s.valuesFinished = false
		line = line[match[1]:]
	}
	if !optionsTable.MatchString(s.table) {
		if s.quote == 0 && strings.HasSuffix(strings.TrimSpace(line), ";") {
			s.table = ""
		}
		return nil
	}
	if strings.TrimSpace(line) == "" {
		return nil
	}
	if s.valuesFinished {
		if strings.HasSuffix(strings.TrimSpace(line), ";") {
			s.table = ""
		}
		return nil
	}
	if !s.hasValues {
		keyword, end := findValues(line)
		if s.columns == nil {
			if s.collectingColumns {
				if close := strings.IndexByte(line, ')'); close >= 0 {
					s.columns = parseColumns(s.columnBuffer + " " + line[:close])
					s.columnBuffer = ""
					s.collectingColumns = false
				} else {
					s.columnBuffer += " " + line
				}
			} else if open := strings.IndexByte(line, '('); open >= 0 && (keyword < 0 || open < keyword) {
				if close := strings.IndexByte(line[open+1:], ')'); close >= 0 {
					s.columns = parseColumns(line[open+1 : open+1+close])
				} else {
					s.columnBuffer = line[open+1:]
					s.collectingColumns = true
				}
			}
		}
		if keyword < 0 {
			return nil
		}
		s.hasValues = true
		line = line[end:]
	}
	input := line
	if s.rowBuffer != "" {
		input = s.rowBuffer + "\n" + line
	}
	rows, remainder, finished := parseRows(input)
	s.rowBuffer = remainder
	s.valuesFinished = finished
	if remainder == "" && strings.HasSuffix(strings.TrimSpace(line), ";") {
		s.table = ""
	}
	columns := s.columns
	if columns == nil {
		columns = []string{"option_id", "option_name", "option_value", "autoload"}
	}
	nameIndex, valueIndex := -1, -1
	for i, col := range columns {
		if col == "option_name" {
			nameIndex = i
		}
		if col == "option_value" {
			valueIndex = i
		}
	}
	var matches [][]string
	for _, row := range rows {
		if nameIndex < 0 || valueIndex < 0 || nameIndex >= len(row) || valueIndex >= len(row) {
			continue
		}
		name, value := strings.ToLower(unquoteSQL(row[nameIndex])), unquoteSQL(row[valueIndex])
		if (name == "home" || name == "siteurl") && httpSchemePrefixCI.MatchString(value) {
			matches = append(matches, []string{"", name, value})
		}
	}
	return matches
}

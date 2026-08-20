package output

import (
	"io"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/mattn/go-runewidth"
	"golang.org/x/term"
)

const terminalTableSafetyMargin = 2

// nodeANSIRegexp is the Go equivalent of ansi-regex v5.0.1, which is what
// cli-table3 reaches through string-width in the Node CLI. Keeping that exact
// compatibility includes its historical OSC handling quirks.
var nodeANSIRegexp = regexp.MustCompile(
	`[\x1B\x{009B}][\[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d\\/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\\/#&.:=?%@~_]*)*)?\x07)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))`,
)

var nodeSGRRegexp = regexp.MustCompile(`\x1b\[([0-9;]*)m`)

var nodeStyleCodes = []int{1, 2, 3, 4, 5, 7, 8, 9}

var nodeStyleCloseCodes = map[int]string{
	1: "\x1b[22m",
	2: "\x1b[22m",
	3: "\x1b[23m",
	4: "\x1b[24m",
	5: "\x1b[25m",
	7: "\x1b[27m",
	8: "\x1b[28m",
	9: "\x1b[29m",
}

type nodeWrapToken struct {
	raw        string
	width      int
	whitespace bool
}

type nodeSGRState struct {
	foreground string
	background string
	styles     map[int]string
}

type nodeFDWriter interface {
	Fd() uintptr
}

// terminalTableIsTTY reports whether w is an interactive terminal.
//
// It is the Go equivalent of Node's `process.stdout.isTTY`, and it gates BOTH
// of the render-time decisions cli-table3 makes for the Node CLI:
//
//   - column widths (see terminalTableWidth below), and
//   - whether the table is colourised at all.
//
// The colour half was missing, and that was a real regression: `vip logs`
// under cron, systemd, ssh without a tty, `docker exec`, or any `>file`
// redirect got escape sequences Node would not have written. Node's
// src/bin/vip-logs.js:162-172 says so explicitly —
//
//	if ( process.stdout.isTTY && process.stdout.columns ) {
//	    options.colWidths = [ ... ];
//	} else {
//	    options.style.head = [];
//	    options.style.border = [];
//	}
//
// and every other table goes through src/lib/cli/format.ts `table()`, which
// asks for `style.head = [ 'brightBlue' ]` and lets cli-table3's colour layer
// decide: that layer disables itself when stdout is not a TTY, so those tables
// come out plain too. One predicate therefore covers both surfaces.
func terminalTableIsTTY(w io.Writer) bool {
	f, ok := w.(nodeFDWriter)
	if !ok {
		return false
	}
	return term.IsTerminal(int(f.Fd()))
}

func terminalTableWidth(w io.Writer) int {
	f, ok := w.(nodeFDWriter)
	if !ok {
		return 0
	}
	fd := int(f.Fd())
	if !term.IsTerminal(fd) {
		return 0
	}
	cols, _, err := term.GetSize(fd)
	if err != nil || cols <= terminalTableSafetyMargin {
		return 0
	}
	return cols - terminalTableSafetyMargin
}

func nodeColumnWidths(headers []string, rows [][]string, maxTableWidth int) []int {
	widths := nodeNaturalColumnWidths(headers, rows)
	if maxTableWidth <= 0 || nodeTableWidth(widths) <= maxTableWidth {
		return widths
	}
	for i := range widths {
		if widths[i] < 1 {
			widths[i] = 1
		}
	}

	budget := maxTableWidth - nodeTableOverhead(len(widths))
	if budget < len(widths) {
		budget = len(widths)
	}

	preferred := make([]int, len(headers))
	for i, header := range headers {
		preferred[i] = nodeHeaderMinimumWidth(header)
		if preferred[i] > widths[i] {
			preferred[i] = widths[i]
		}
	}
	shrinkNodeWidths(widths, preferred, budget)

	ones := make([]int, len(widths))
	for i := range ones {
		ones[i] = 1
	}
	shrinkNodeWidths(widths, ones, budget)
	return widths
}

func nodeNaturalColumnWidths(headers []string, rows [][]string) []int {
	widths := make([]int, len(headers))
	for i, header := range headers {
		widths[i] = nodeDisplayWidth(header)
	}
	for _, row := range rows {
		for i, value := range row {
			if i >= len(widths) {
				break
			}
			for _, line := range strings.Split(value, "\n") {
				if width := nodeDisplayWidth(line); width > widths[i] {
					widths[i] = width
				}
			}
		}
	}
	return widths
}

func nodeHeaderMinimumWidth(header string) int {
	minimum := 1
	for _, word := range strings.Fields(stripNodeANSI(header)) {
		if width := runewidth.StringWidth(word); width > minimum {
			minimum = width
		}
	}
	return minimum
}

func shrinkNodeWidths(widths, minimums []int, budget int) {
	total := sumNodeWidths(widths)
	for total > budget {
		widest := 0
		for i, width := range widths {
			if width > minimums[i] && width > widest {
				widest = width
			}
		}
		if widest == 0 {
			return
		}
		for i := range widths {
			if total <= budget {
				return
			}
			if widths[i] == widest && widths[i] > minimums[i] {
				widths[i]--
				total--
			}
		}
	}
}

func sumNodeWidths(widths []int) int {
	total := 0
	for _, width := range widths {
		total += width
	}
	return total
}

func nodeTableOverhead(columns int) int {
	return 3*columns + 1
}

func nodeTableWidth(widths []int) int {
	return sumNodeWidths(widths) + nodeTableOverhead(len(widths))
}

func nodeDisplayWidth(value string) int {
	return runewidth.StringWidth(stripNodeANSI(value))
}

func stripNodeANSI(value string) string {
	return nodeANSIRegexp.ReplaceAllString(value, "")
}

func wrapNodeCell(value string, width int) []string {
	if width < 1 {
		width = 1
	}

	var lines []string
	for _, logicalLine := range strings.Split(value, "\n") {
		lines = append(lines, wrapNodeLogicalLine(logicalLine, width)...)
	}
	return colorizeNodeLines(lines)
}

func wrapNodeLogicalLine(value string, width int) []string {
	if value == "" {
		return []string{""}
	}

	tokens := tokenizeNodeText(value)
	lines := make([]string, 0, 1)
	for len(tokens) > 0 {
		line, rest := splitNodeTokensAtBoundary(tokens, width)
		lines = append(lines, nodeTokensString(line))
		tokens = rest
	}
	if len(lines) == 0 {
		return []string{""}
	}
	return lines
}

func tokenizeNodeText(value string) []nodeWrapToken {
	var tokens []nodeWrapToken
	appendVisible := func(text string) {
		for _, r := range text {
			tokens = append(tokens, nodeWrapToken{
				raw:        string(r),
				width:      runewidth.RuneWidth(r),
				whitespace: unicode.IsSpace(r),
			})
		}
	}

	position := 0
	for _, location := range nodeANSIRegexp.FindAllStringIndex(value, -1) {
		appendVisible(value[position:location[0]])
		tokens = append(tokens, nodeWrapToken{raw: value[location[0]:location[1]]})
		position = location[1]
	}
	appendVisible(value[position:])
	return tokens
}

func nodeTokensWidth(tokens []nodeWrapToken) int {
	width := 0
	for _, token := range tokens {
		width += token.width
	}
	return width
}

func nodeTokensString(tokens []nodeWrapToken) string {
	var value strings.Builder
	for _, token := range tokens {
		value.WriteString(token.raw)
	}
	return value.String()
}

func splitNodeTokensAtBoundary(tokens []nodeWrapToken, width int) (line, rest []nodeWrapToken) {
	visibleWidth := 0
	lastWhitespaceStart := -1
	lastWhitespaceEnd := -1

	i := 0
	for i < len(tokens) {
		if tokens[i].whitespace {
			start := i
			widthBeforeWhitespace := visibleWidth
			for i < len(tokens) && tokens[i].whitespace {
				visibleWidth += tokens[i].width
				i++
			}
			if widthBeforeWhitespace > 0 && widthBeforeWhitespace <= width {
				lastWhitespaceStart = start
				lastWhitespaceEnd = i
			}
			if visibleWidth > width {
				break
			}
			continue
		}

		if tokens[i].width > 0 && visibleWidth+tokens[i].width > width {
			break
		}
		visibleWidth += tokens[i].width
		i++
	}
	if i == len(tokens) && visibleWidth <= width {
		return tokens, nil
	}

	if lastWhitespaceStart >= 0 {
		line = tokens[:lastWhitespaceStart]
		rest = tokens[lastWhitespaceEnd:]
		if nodeTokensWidth(line) > 0 {
			return line, rest
		}
	}

	visibleWidth = 0
	cut := 0
	hasVisibleToken := false
	for cut < len(tokens) {
		token := tokens[cut]
		if token.width > 0 && visibleWidth+token.width > width {
			if hasVisibleToken {
				break
			}
			cut++
			hasVisibleToken = true
			break
		}
		visibleWidth += token.width
		if token.width > 0 {
			hasVisibleToken = true
		}
		cut++
	}
	for cut < len(tokens) && tokens[cut].width == 0 && !tokens[cut].whitespace {
		cut++
	}
	return tokens[:cut], tokens[cut:]
}

func colorizeNodeLines(lines []string) []string {
	state := nodeSGRState{styles: make(map[int]string)}
	colored := make([]string, len(lines))
	for i, line := range lines {
		line = state.prefix() + line
		state.update(line)
		colored[i] = line + state.suffix()
	}
	return colored
}

func (s *nodeSGRState) update(line string) {
	for _, match := range nodeSGRRegexp.FindAllStringSubmatch(line, -1) {
		codes := []int{0}
		if match[1] != "" {
			codes = codes[:0]
			for _, value := range strings.Split(match[1], ";") {
				code, err := strconv.Atoi(value)
				if err == nil {
					codes = append(codes, code)
				}
			}
		}
		for i := 0; i < len(codes); i++ {
			code := codes[i]
			if code == 38 || code == 48 {
				length := nodeExtendedColorLength(codes[i:])
				s.updateCode(code, nodeSGRSequence(codes[i:i+length]))
				i += length - 1
				continue
			}
			s.updateCode(code, nodeSGRSequence([]int{code}))
		}
	}
}

func nodeExtendedColorLength(codes []int) int {
	if len(codes) < 2 {
		return 1
	}
	want := 1
	switch codes[1] {
	case 2:
		want = 5
	case 5:
		want = 3
	}
	if want > len(codes) {
		return len(codes)
	}
	return want
}

func nodeSGRSequence(codes []int) string {
	var sequence strings.Builder
	sequence.WriteString("\x1b[")
	for i, code := range codes {
		if i > 0 {
			sequence.WriteByte(';')
		}
		sequence.WriteString(strconv.Itoa(code))
	}
	sequence.WriteByte('m')
	return sequence.String()
}

func (s *nodeSGRState) updateCode(code int, raw string) {
	switch {
	case code == 0:
		s.foreground = ""
		s.background = ""
		clear(s.styles)
	case code == 1 || code == 2 || code == 3 || code == 4 || code == 5 || code == 7 || code == 8 || code == 9:
		s.styles[code] = raw
	case code == 22:
		delete(s.styles, 1)
		delete(s.styles, 2)
	case code == 23:
		delete(s.styles, 3)
	case code == 24:
		delete(s.styles, 4)
	case code == 25:
		delete(s.styles, 5)
	case code == 27:
		delete(s.styles, 7)
	case code == 28:
		delete(s.styles, 8)
	case code == 29:
		delete(s.styles, 9)
	case (code >= 30 && code <= 38) || (code >= 90 && code <= 97):
		s.foreground = raw
	case code == 39:
		s.foreground = ""
	case (code >= 40 && code <= 48) || (code >= 100 && code <= 107):
		s.background = raw
	case code == 49:
		s.background = ""
	}
}

func (s nodeSGRState) prefix() string {
	var prefix strings.Builder
	for _, code := range nodeStyleCodes {
		prefix.WriteString(s.styles[code])
	}
	prefix.WriteString(s.background)
	prefix.WriteString(s.foreground)
	return prefix.String()
}

func (s nodeSGRState) suffix() string {
	var suffix strings.Builder
	for _, code := range nodeStyleCodes {
		if s.styles[code] != "" {
			suffix.WriteString(nodeStyleCloseCodes[code])
		}
	}
	if s.background != "" {
		suffix.WriteString("\x1b[49m")
	}
	if s.foreground != "" {
		suffix.WriteString("\x1b[39m")
	}
	return suffix.String()
}

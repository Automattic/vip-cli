package sqlvalidation

import (
	"fmt"
	"regexp"
	"strings"
)

var delimiterDirective = regexp.MustCompile(`(?i)^[ \t]*DELIMITER[ \t]+([^ \t\r\n]+)[ \t]*$`)

// engineScanner recognizes table engine options without retaining row data.
type engineScanner struct {
	phase, alterStage, createStage  string
	quote                           byte
	quotedValue                     string
	block, executable               bool
	depth                           int
	sawCreateBody, alterCanEngine   bool
	alterInOptions, alterInOrder    bool
	alterPrevious                   string
	createPrevious                  string
	engineOrderCandidate            bool
	engineLine                      int
	engineEquals                    bool
	noBackslashEscapes              bool
	sqlModeAssignment               bool
	setAtCount                      int
	setGlobalScope                  bool
	sqlModeSegment                  string
	sqlModeSegmentLong              bool
	sqlModeValueHasMode             bool
	ansiQuotes, sqlModeValueHasAnsi bool
	delimiter                       string
	started                         bool
	partitionClause                 bool
	partitionDefinitionDepth        int
	partitionPrevious               string
}

func (s *engineScanner) reset() {
	s.phase, s.alterStage, s.createStage = "", "", ""
	s.depth, s.engineLine = 0, 0
	s.sawCreateBody, s.alterCanEngine, s.engineEquals = false, false, false
	s.alterInOptions, s.alterInOrder, s.engineOrderCandidate = false, false, false
	s.alterPrevious = ""
	s.createPrevious = ""
	s.sqlModeAssignment = false
	s.setAtCount, s.setGlobalScope = 0, false
	s.partitionClause, s.partitionDefinitionDepth, s.partitionPrevious = false, 0, ""
}

func engineIdent(c byte) bool { return isIdent(c) || c >= 0x80 }

func alterTableOption(word string) bool {
	switch word {
	case "AUTO_INCREMENT", "AUTOEXTEND_SIZE", "AVG_ROW_LENGTH", "CHARACTER", "CHARSET", "CHECKSUM", "COLLATE", "COMMENT", "COMPRESSION", "CONNECTION", "DATA", "DEFAULT", "DELAY_KEY_WRITE", "ENCRYPTION", "ENGINE", "ENGINE_ATTRIBUTE", "INDEX", "INSERT_METHOD", "KEY_BLOCK_SIZE", "MAX_ROWS", "MIN_ROWS", "PACK_KEYS", "PASSWORD", "ROW_FORMAT", "SECONDARY_ENGINE_ATTRIBUTE", "STATS_AUTO_RECALC", "STATS_PERSISTENT", "STATS_SAMPLE_PAGES", "TABLESPACE", "UNION":
		return true
	}
	return false
}

func optionValuePrefix(word string) bool {
	return word == "=" || word == "SET" || (word != "ENGINE" && alterTableOption(word))
}

func (s *engineScanner) token(text string, line int, findings *[]int, quoted bool) {
	upper := strings.ToUpper(text)
	if s.engineLine != 0 {
		if text == "=" && !s.engineEquals {
			s.engineEquals = true
			return
		}
		valid := quoted || text != ""
		for i := 0; i < len(text) && !quoted; i++ {
			if !engineIdent(text[i]) {
				valid = false
				break
			}
		}
		if valid && upper != "INNODB" && !(s.engineOrderCandidate && !s.engineEquals && (upper == "ASC" || upper == "DESC")) {
			*findings = append(*findings, s.engineLine)
		}
		s.engineLine, s.engineEquals = 0, false
		s.engineOrderCandidate = false
	}
	if text == ";" && !quoted {
		s.reset()
		return
	}
	switch s.phase {
	case "":
		if !quoted && upper == "CREATE" {
			s.phase = "create"
		} else if !quoted && upper == "ALTER" {
			s.phase = "alter"
		} else if !quoted && upper == "SET" {
			s.phase = "set"
		} else {
			s.phase = "other"
		}
		return
	case "set":
		if quoted && s.sqlModeAssignment {
			// The streamed segments already decided whether the mode is present.
			s.noBackslashEscapes = s.sqlModeValueHasMode
			s.ansiQuotes = s.sqlModeValueHasAnsi
			s.sqlModeAssignment = false
		} else if !quoted && text == "@" {
			s.setAtCount++
		} else if !quoted && upper == "SQL_MODE" {
			// Single-@ user variables and GLOBAL assignments never change the
			// importing session, so only session assignments count.
			s.sqlModeAssignment = s.setAtCount != 1 && !s.setGlobalScope
			s.setAtCount = 0
		} else if !quoted && upper == "GLOBAL" {
			s.setGlobalScope = true
			s.setAtCount = 0
		} else if !quoted && text == "," {
			// Each comma-separated assignment carries its own scope.
			s.setGlobalScope = false
			s.setAtCount = 0
			s.sqlModeAssignment = false
		} else if !quoted && text != "=" {
			s.sqlModeAssignment = false
			s.setAtCount = 0
		}
		return
	case "create":
		if !quoted && upper == "TEMPORARY" {
			s.phase = "temporary"
		} else if !quoted && upper == "OR" {
			s.phase = "create-or"
		} else if !quoted && upper == "TABLE" {
			s.phase = "create-table"
		} else {
			s.phase = "other"
		}
		return
	case "create-or":
		if !quoted && upper == "REPLACE" {
			s.phase = "create-replace"
		} else {
			s.phase = "other"
		}
		return
	case "create-replace":
		s.phase = "create"
		s.token(text, line, findings, quoted)
		return
	case "temporary", "alter":
		if s.phase == "alter" && !quoted && (upper == "IGNORE" || upper == "ONLINE" || upper == "OFFLINE") {
			return
		}
		if !quoted && upper == "TABLE" {
			if s.phase == "alter" {
				s.phase = "alter-table"
			} else {
				s.phase = "create-table"
			}
		} else {
			s.phase = "other"
		}
		return
	case "create-table", "alter-table":
	default:
		return
	}
	if s.phase == "create-table" && s.createStage != "options" {
		if s.createStage == "" && !quoted && upper == "IF" {
			s.createStage = "if-not"
			return
		}
		if s.createStage == "if-not" || s.createStage == "if-exists" {
			if !quoted && s.createStage == "if-not" && upper == "NOT" {
				s.createStage = "if-exists"
			} else if !quoted && s.createStage == "if-exists" && upper == "EXISTS" {
				s.createStage = ""
			} else {
				s.phase = "other"
			}
			return
		}
		if s.createStage == "" || s.createStage == "qualified" {
			s.createStage = "after-name"
			return
		}
		if !quoted && text == "." {
			s.createStage = "qualified"
			return
		}
		s.createStage = "options"
		if text != "(" || quoted {
			s.sawCreateBody = true
		}
	}
	// Partition definitions have their own ENGINE options, outside column
	// bodies and partitioning expressions.
	if s.depth == 0 && !quoted && upper == "PARTITION" && (s.sawCreateBody || (s.phase == "alter-table" && s.alterStage == "actions")) {
		s.partitionClause = true
	}
	if s.partitionClause {
		if s.depth > 0 && !quoted && (upper == "PARTITION" || upper == "SUBPARTITION") && (s.partitionPrevious == "(" || s.partitionPrevious == ",") {
			s.partitionDefinitionDepth = s.depth
		}
		if s.partitionDefinitionDepth == s.depth && s.depth > 0 && !quoted && upper == "ENGINE" {
			s.engineLine = line
		}
		s.partitionPrevious = text
	}
	if !quoted && text == "(" {
		s.depth++
		s.sawCreateBody = true
		return
	}
	if !quoted && text == ")" {
		if s.depth > 0 {
			s.depth--
		}
		if s.depth < s.partitionDefinitionDepth {
			s.partitionDefinitionDepth = 0
		}
		if s.depth == 0 {
			s.createPrevious, s.alterPrevious = ")", ")"
		}
		return
	}
	if s.depth > 0 {
		return
	}
	if s.phase == "alter-table" {
		previous := s.alterPrevious
		s.alterPrevious = upper
		if previous == "=" || (upper == "DEFAULT" && alterTableOption(previous)) {
			s.alterPrevious = "<value>"
		}
		if s.alterStage == "" && !quoted && upper == "IF" {
			s.alterStage = "if-exists"
			return
		}
		if s.alterStage == "if-exists" {
			if !quoted && upper == "EXISTS" {
				s.alterStage = ""
			} else {
				s.alterStage = "actions"
			}
			return
		}
		if s.alterStage == "" || s.alterStage == "qualified" {
			s.alterStage = "after-name"
			return
		}
		if s.alterStage == "after-name" {
			if text == "." {
				s.alterStage = "qualified"
				return
			}
			s.alterStage, s.alterCanEngine = "actions", true
		}
		if text == "," && !quoted {
			s.alterCanEngine = true
			s.alterInOptions = false
			return
		}
		if s.alterCanEngine && !quoted && upper == "ORDER" {
			s.alterInOrder = true
		} else if s.alterCanEngine && !quoted && alterTableOption(upper) {
			s.alterInOptions = true
		}
		if (s.alterCanEngine || (s.alterInOptions && !optionValuePrefix(previous))) && !quoted && upper == "ENGINE" {
			s.engineLine = line
			s.engineOrderCandidate = s.alterInOrder
		}
		s.alterCanEngine = false
		return
	}
	previous := s.createPrevious
	s.createPrevious = upper
	if previous == "=" || (upper == "DEFAULT" && alterTableOption(previous)) {
		s.createPrevious = "<value>"
	}
	if s.sawCreateBody && !quoted && upper == "ENGINE" && !optionValuePrefix(previous) {
		s.engineLine = line
	} else if s.sawCreateBody && !quoted && (upper == "AS" || upper == "SELECT") {
		s.phase = "other"
	}
}

// extendSQLModeSegment appends a comma-free span to the current segment,
// marking it unusable once it grows past the bounded window.
func (s *engineScanner) extendSQLModeSegment(span string) {
	if s.sqlModeSegmentLong {
		return
	}
	s.sqlModeSegment += span
	if len(s.sqlModeSegment) > 128 {
		s.sqlModeSegmentLong = true
		s.sqlModeSegment = ""
	}
}

// completeSQLModeSegment checks one finished comma-separated mode.
func (s *engineScanner) completeSQLModeSegment() {
	if !s.sqlModeSegmentLong && strings.ToUpper(strings.TrimSpace(s.sqlModeSegment)) == "NO_BACKSLASH_ESCAPES" {
		s.sqlModeValueHasMode = true
	}
	if !s.sqlModeSegmentLong {
		switch strings.ToUpper(strings.TrimSpace(s.sqlModeSegment)) {
		case "ANSI", "ANSI_QUOTES", "DB2", "MAXDB", "MSSQL", "ORACLE", "POSTGRESQL":
			s.sqlModeValueHasAnsi = true
		}
	}
	s.sqlModeSegment = ""
	s.sqlModeSegmentLong = false
}

// appendSQLMode streams a quoted value chunk through the bounded segments so
// modes beyond any fixed capture window are still recognized.
func (s *engineScanner) appendSQLMode(chunk string) {
	for len(chunk) > 0 {
		comma := strings.IndexByte(chunk, ',')
		if comma < 0 {
			s.extendSQLModeSegment(chunk)
			return
		}
		s.extendSQLModeSegment(chunk[:comma])
		s.completeSQLModeSegment()
		chunk = chunk[comma+1:]
	}
}

func (s *engineScanner) scan(line string, lineNumber int) []int {
	var findings []int
	if !s.started {
		s.started = true
		line = strings.TrimPrefix(line, "\xef\xbb\xbf")
	}
	if s.delimiter == "" {
		s.delimiter = ";"
	}
	if s.quote == 0 && !s.block && !s.executable {
		if directive := delimiterDirective.FindStringSubmatch(line); directive != nil {
			s.delimiter = directive[1]
			s.reset()
			return findings
		}
	}
	for i := 0; i < len(line); {
		if s.block {
			end := strings.Index(line[i:], "*/")
			if end < 0 {
				break
			}
			s.block = false
			i += end + 2
			continue
		}
		if s.quote != 0 {
			end := strings.IndexByte(line[i:], s.quote)
			if end < 0 {
				if s.sqlModeAssignment {
					s.appendSQLMode(line[i:] + "\n")
				} else if s.engineLine != 0 {
					s.quotedValue += line[i:min(len(line), i+128)] + "\n"
					if len(s.quotedValue) > 128 {
						s.quotedValue = s.quotedValue[:128]
					}
				}
				break
			}
			end += i
			if s.sqlModeAssignment {
				s.appendSQLMode(line[i:end])
			} else if s.engineLine != 0 {
				s.quotedValue += line[i:min(end, i+128)]
				if len(s.quotedValue) > 128 {
					s.quotedValue = s.quotedValue[:128]
				}
			}
			identifier := s.quote == '`' || (s.quote == '"' && s.ansiQuotes)
			escaped := !identifier && !s.noBackslashEscapes && escapedQuote(line, end)
			if escaped || end+1 < len(line) && line[end+1] == s.quote {
				i = end + 1
				if !escaped && i < len(line) {
					i++
				}
				continue
			}
			i = end + 1
			s.quote = 0
			if s.sqlModeAssignment {
				s.completeSQLModeSegment()
			}
			s.token(s.quotedValue, lineNumber, &findings, true)
			s.quotedValue = ""
			continue
		}
		if s.executable && strings.HasPrefix(line[i:], "*/") {
			s.executable = false
			i += 2
			continue
		}
		if strings.HasPrefix(line[i:], s.delimiter) {
			s.token(";", lineNumber, &findings, false)
			i += len(s.delimiter)
			continue
		}
		if strings.HasPrefix(line[i:], "/*") {
			if strings.HasPrefix(line[i:], "/*!") || strings.HasPrefix(strings.ToUpper(line[i:min(len(line), i+4)]), "/*M!") {
				s.executable = true
				i += 3
				if line[i-1] != '!' {
					i++
				}
				start := i
				for i < len(line) && line[i] >= '0' && line[i] <= '9' && i-start < 6 {
					i++
				}
				if i-start < 5 {
					i = start
				}
			} else {
				s.block = true
				i += 2
			}
			continue
		}
		if line[i] == '#' || strings.HasPrefix(line[i:], "--") && (i+2 == len(line) || (line[i+2] <= 0x20 || line[i+2] == 0x7f)) {
			break
		}
		if strings.ContainsRune("'\"`", rune(line[i])) {
			s.quote = line[i]
			s.quotedValue = ""
			s.sqlModeSegment = ""
			s.sqlModeSegmentLong = false
			s.sqlModeValueHasMode = false
			s.sqlModeValueHasAnsi = false
			i++
			continue
		}
		if s.phase == "set" && line[i] == '@' {
			// Preserve variable sigils so user and system variables differ.
			s.token("@", lineNumber, &findings, false)
			i++
			continue
		}
		if s.phase == "other" && line[i] != ';' {
			next := strings.IndexAny(line[i+1:], "'\"`;#/-")
			delimiterIndex := strings.Index(line[i+1:], s.delimiter)
			if delimiterIndex >= 0 && (next < 0 || delimiterIndex < next) {
				next = delimiterIndex
			}
			if next < 0 {
				break
			}
			i += next + 1
			continue
		}
		if engineIdent(line[i]) {
			end := i + 1
			for end < len(line) && engineIdent(line[end]) {
				end++
			}
			if delimiterIndex := strings.Index(line[i:end], s.delimiter); delimiterIndex >= 0 {
				end = i + delimiterIndex
			}
			s.token(line[i:end], lineNumber, &findings, false)
			i = end
			continue
		}
		if strings.ContainsRune("(),.=", rune(line[i])) {
			s.token(line[i:i+1], lineNumber, &findings, false)
		}
		i++
	}
	unique := make([]int, 0, len(findings))
	seen := make(map[int]bool)
	for _, n := range findings {
		if !seen[n] {
			seen[n] = true
			unique = append(unique, n)
		}
	}
	return unique
}

// finish prevents a lexical desynchronization from silently hiding later DDL.
func (s *engineScanner) finish() error {
	if s.quote != 0 || s.block || s.executable {
		return fmt.Errorf("SQL engine validation could not finish: unterminated quoted value or block comment.")
	}
	return nil
}

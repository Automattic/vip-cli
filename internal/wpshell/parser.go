// Package wpshell ports the WP-CLI subshell from src/bin/vip-wp.js and
// the DFA command parser from src/lib/wp/helpers.ts. The parser
// accumulates a full WP-CLI command across physical input lines,
// preserving quoted multiline values without shell unescaping.
package wpshell

type state int

const (
	s0 state = iota // normal
	s1              // after backslash
	s2              // inside double quotes
	s3              // after backslash inside double quotes
	s4              // inside single quotes
	ff              // final
)

// CmdState mirrors helpers.ts CmdState.
type CmdState struct {
	state   state
	Command string
	Done    bool
}

func NewCmdState() *CmdState { st := &CmdState{}; ResetState(st); return st }

func ResetState(st *CmdState) { st.state = s0; st.Command = ""; st.Done = false }

// stateTable: rows = current state, cols = char class [\ " ' \n other].
// helpers.ts:78.
var stateTable = [6][5]state{
	/* s0 */ {s1, s2, s4, ff, s0},
	/* s1 */ {s0, s0, s0, ff, s0},
	/* s2 */ {s3, s0, s2, s2, s2},
	/* s3 */ {s2, s2, s2, s2, s2},
	/* s4 */ {s4, s4, s0, s4, s4},
	/* ff */ {ff, ff, ff, ff, ff},
}

func charClass(r rune) int {
	switch r {
	case '\\':
		return 0
	case '"':
		return 1
	case '\'':
		return 2
	case '\n':
		return 3
	default:
		return 4
	}
}

// StateMachine ports stateMachine (helpers.ts:120): appends a newline to
// the line, then walks each rune. Reaching ff sets Done and stops
// (the terminating newline is NOT appended to Command).
func StateMachine(st *CmdState, line string) {
	line += "\n"
	for _, r := range line {
		st.state = stateTable[st.state][charClass(r)]
		if st.state == ff {
			st.Done = true
			return
		}
		st.Command += string(r)
	}
}

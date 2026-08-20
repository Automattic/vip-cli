package wpshell

import (
	"bufio"
	"fmt"
	"io"
	"strings"
)

// REPL drives the interactive WP-CLI subshell. Run is invoked with each
// finalized command (leading "wp " stripped, matching vip-wp.js:493).
// Serve returns when input reaches EOF or the user types `exit`.
type REPL struct {
	Prompt string
	Run    func(command string) error
}

// Serve reads lines until EOF / exit. Port of the readline 'line' handler
// (vip-wp.js:445). Non-`wp` first input is rejected; `wp ...` commands are
// accumulated via the DFA across lines.
func (r *REPL) Serve(in *bufio.Reader, out io.Writer) error {
	state := NewCmdState()
	seenWP := false

	fmt.Fprint(out, r.Prompt)
	for {
		line, err := in.ReadString('\n')
		line = strings.TrimRight(line, "\n")
		atEOF := err == io.EOF

		if !atEOF || line != "" {
			if r.handleLine(out, state, &seenWP, line) == exitREPL {
				return nil
			}
		}
		if atEOF {
			return nil
		}
	}
}

type lineResult int

const (
	continueREPL lineResult = iota
	exitREPL
)

func (r *REPL) handleLine(out io.Writer, state *CmdState, seenWP *bool, line string) lineResult {
	// Blank line re-prompts (vip-wp.js:451).
	if line == "" {
		fmt.Fprint(out, r.Prompt)
		return continueREPL
	}
	// exit / exit; quits when not mid-command (vip-wp.js:457).
	if !*seenWP && strings.HasPrefix(line, "exit") {
		return exitREPL
	}
	if !*seenWP && strings.HasPrefix(strings.TrimLeft(line, " \t"), "wp ") {
		*seenWP = true
		ResetState(state)
	}
	if !*seenWP {
		ResetState(state)
		fmt.Fprintln(out, "Error: invalid command, please pass a valid WP-CLI command.")
		fmt.Fprint(out, r.Prompt)
		return continueREPL
	}

	StateMachine(state, line)
	if !state.Done {
		return continueREPL // keep accumulating (multiline quote)
	}

	cmd := strings.TrimPrefix(state.Command, "wp ")
	*seenWP = false
	ResetState(state)
	_ = r.Run(cmd)
	fmt.Fprint(out, r.Prompt)
	return continueREPL
}

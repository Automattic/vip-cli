package wpshell

import "testing"

func TestStateMachineSingleLine(t *testing.T) {
	st := NewCmdState()
	StateMachine(st, "wp option get home")
	if !st.Done {
		t.Fatal("single line should finalize on the trailing newline")
	}
	if st.Command != "wp option get home" {
		t.Errorf("command = %q", st.Command)
	}
}

func TestStateMachineMultilineQuoted(t *testing.T) {
	st := NewCmdState()
	StateMachine(st, `wp option set mykey "first line`)
	if st.Done {
		t.Fatal("open double-quote must not finalize")
	}
	StateMachine(st, `second line"`)
	if !st.Done {
		t.Fatal("closing quote + newline finalizes")
	}
	if st.Command != "wp option set mykey \"first line\nsecond line\"" {
		t.Errorf("command = %q", st.Command)
	}
}

func TestStateMachineSingleQuotes(t *testing.T) {
	st := NewCmdState()
	StateMachine(st, `wp eval 'return "x";'`)
	if !st.Done || st.Command != `wp eval 'return "x";'` {
		t.Errorf("done=%v command=%q", st.Done, st.Command)
	}
}

func TestStateMachineBackslashNotContinuation(t *testing.T) {
	// helpers.ts: a backslash before newline is NOT a line continuation.
	st := NewCmdState()
	StateMachine(st, `wp post list \`)
	if !st.Done {
		t.Fatalf("backslash-at-eol still terminates (done=%v)", st.Done)
	}
	if st.Command != `wp post list \` {
		t.Errorf("command = %q", st.Command)
	}
}

func TestResetState(t *testing.T) {
	st := NewCmdState()
	StateMachine(st, "wp x")
	ResetState(st)
	if st.Done || st.Command != "" {
		t.Errorf("reset failed: %+v", st)
	}
}

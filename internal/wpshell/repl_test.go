package wpshell

import (
	"bufio"
	"reflect"
	"strings"
	"testing"
)

func TestREPLRunsValidCommand(t *testing.T) {
	var ran []string
	in := strings.NewReader("wp option get home\nexit\n")
	var out strings.Builder
	loop := &REPL{
		Prompt: "app.develop:~$ ",
		Run:    func(cmd string) error { ran = append(ran, cmd); return nil },
	}
	if err := loop.Serve(bufio.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	if len(ran) != 1 || ran[0] != "option get home" {
		t.Errorf("ran = %v (leading 'wp ' must be stripped)", ran)
	}
}

func TestREPLTerminalContinuation(t *testing.T) {
	lines := []string{"wp option set k \"line1", "line2\"", "invalid", "exit"}
	var continuations []bool
	var ran []string
	loop := &REPL{
		Run: func(cmd string) error { ran = append(ran, cmd); return nil },
		ReadLine: func(continuation bool) (string, error) {
			continuations = append(continuations, continuation)
			line := lines[0]
			lines = lines[1:]
			return line, nil
		},
	}
	var out strings.Builder
	if err := loop.Serve(nil, &out); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(continuations, []bool{false, true, false, false}) {
		t.Errorf("continuation modes = %v", continuations)
	}
	if !reflect.DeepEqual(ran, []string{"option set k \"line1\nline2\""}) {
		t.Errorf("commands = %q", ran)
	}
}

func TestREPLInvalidCommand(t *testing.T) {
	in := strings.NewReader("ls -la\nexit\n")
	var out strings.Builder
	loop := &REPL{Run: func(string) error { t.Fatal("must not run"); return nil }}
	_ = loop.Serve(bufio.NewReader(in), &out)
	if !strings.Contains(out.String(), "invalid command, please pass a valid WP-CLI command.") {
		t.Errorf("out = %q", out.String())
	}
}

func TestREPLExit(t *testing.T) {
	in := strings.NewReader("exit\n")
	var out strings.Builder
	ran := false
	loop := &REPL{Run: func(string) error { ran = true; return nil }}
	if err := loop.Serve(bufio.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	if ran {
		t.Error("exit must not run a command")
	}
}

func TestREPLMultilineCommand(t *testing.T) {
	var ran []string
	in := strings.NewReader("wp option set k \"line1\nline2\"\nexit\n")
	var out strings.Builder
	loop := &REPL{Run: func(cmd string) error { ran = append(ran, cmd); return nil }}
	if err := loop.Serve(bufio.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	if len(ran) != 1 || ran[0] != "option set k \"line1\nline2\"" {
		t.Errorf("ran = %v", ran)
	}
}

func TestREPLBlankLineReprompts(t *testing.T) {
	in := strings.NewReader("\n\nexit\n")
	var out strings.Builder
	loop := &REPL{Prompt: "P$ ", Run: func(string) error { return nil }}
	if err := loop.Serve(bufio.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	if strings.Count(out.String(), "P$ ") < 2 {
		t.Errorf("expected multiple prompts, out = %q", out.String())
	}
}

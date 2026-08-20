package wpshell

import (
	"bufio"
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

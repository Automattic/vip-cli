//go:build !windows

package output

import (
	"bufio"
	"strings"
	"testing"

	"github.com/creack/pty"
)

func TestTerminalTableWidthUsesTTYColumnsWithSafetyMargin(t *testing.T) {
	primary, replica, err := pty.Open()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = primary.Close() }()
	defer func() { _ = replica.Close() }()

	if err := pty.Setsize(replica, &pty.Winsize{Cols: 80, Rows: 24}); err != nil {
		t.Fatal(err)
	}
	if got := terminalTableWidth(replica); got != 78 {
		t.Fatalf("terminalTableWidth() = %d, want 78", got)
	}
	if !terminalTableIsTTY(replica) {
		t.Fatal("terminalTableIsTTY(pty) = false, want true")
	}
}

// The other half of the TTY gate: written to a real terminal, the table keeps
// the grey border and bright-blue head. Without this, "strip ANSI when not a
// TTY" could be satisfied by stripping it everywhere.
func TestRenderNodeTableToTTYKeepsANSI(t *testing.T) {
	primary, replica, err := pty.Open()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = primary.Close() }()
	defer func() { _ = replica.Close() }()

	if err := pty.Setsize(replica, &pty.Winsize{Cols: 80, Rows: 24}); err != nil {
		t.Fatal(err)
	}

	// Read concurrently: a pty has a small kernel buffer and the writer would
	// block once it fills.
	lines := make(chan string, 1)
	go func() {
		reader := bufio.NewReader(primary)
		line, _ := reader.ReadString('\n')
		lines <- line
	}()

	if err := renderNodeTable(replica, []string{"id"}, [][]string{{"1"}}); err != nil {
		t.Fatal(err)
	}
	first := <-lines
	if !strings.Contains(first, "\x1b[90m") {
		t.Fatalf("table written to a TTY lost its border colour: %q", first)
	}
}

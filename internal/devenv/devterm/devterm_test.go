package devterm

import (
	"bytes"
	"context"
	"runtime"
	"strings"
	"testing"
)

// TestRunPipedTeesStdout runs a harmless command and verifies stdout is written
// to the caller-provided stdout writer (devexec wires this to MultiWriter(os.Stdout, log)).
func TestRunPipedTeesStdout(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("requires a POSIX shell (echo/sh)")
	}
	var out, errb bytes.Buffer
	if err := RunPiped(context.Background(), "", []string{"echo", "hello-piped"}, &out, &errb); err != nil {
		t.Fatalf("RunPiped: %v", err)
	}
	if got := strings.TrimSpace(out.String()); got != "hello-piped" {
		t.Fatalf("stdout = %q, want hello-piped", got)
	}
}

// TestRunPipedTeesStderr verifies stderr goes to the stderr writer, not stdout.
func TestRunPipedTeesStderr(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("requires a POSIX shell (echo/sh)")
	}
	var out, errb bytes.Buffer
	if err := RunPiped(context.Background(), "", []string{"sh", "-c", "echo oops 1>&2"}, &out, &errb); err != nil {
		t.Fatalf("RunPiped: %v", err)
	}
	if out.Len() != 0 {
		t.Fatalf("stdout = %q, want empty", out.String())
	}
	if got := strings.TrimSpace(errb.String()); got != "oops" {
		t.Fatalf("stderr = %q, want oops", got)
	}
}

// TestRunPipedPropagatesExit verifies a non-zero child exit surfaces as an error
// (so the CLI can set a non-zero exit code, like Node's process.exitCode = 1).
func TestRunPipedPropagatesExit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("requires a POSIX shell (sh)")
	}
	var out, errb bytes.Buffer
	if err := RunPiped(context.Background(), "", []string{"sh", "-c", "exit 3"}, &out, &errb); err == nil {
		t.Fatal("expected error for non-zero exit")
	}
}

// TestRunPipedEmptyArgv guards the empty-argv path.
func TestRunPipedEmptyArgv(t *testing.T) {
	var out, errb bytes.Buffer
	if err := RunPiped(context.Background(), "", nil, &out, &errb); err == nil {
		t.Fatal("expected error for empty argv")
	}
}

func TestSplitArgvForExec(t *testing.T) {
	argv := []string{"docker", "compose", "-p", "x", "exec", "php", "sh"}
	name, rest := splitArgv(argv)
	if name != "docker" {
		t.Fatalf("name = %q, want docker", name)
	}
	if len(rest) != 6 || rest[0] != "compose" || rest[5] != "sh" {
		t.Fatalf("rest = %v", rest)
	}
}

func TestSplitArgvEmpty(t *testing.T) {
	if _, _, err := safeSplit(nil); err == nil {
		t.Fatal("expected error for empty argv")
	}
}

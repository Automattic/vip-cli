package wpstream

import (
	"bytes"
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// loopbackPair holds both sides of an in-memory loopback for run tests.
type loopbackPair struct {
	// client (A) side — passed to run()
	ssA  *StreamSocket
	cliA *Client
	// server (B) side — scripted in tests
	ssB  *StreamSocket
	cliB *Client
}

// newLoopbackPair builds a cross-linked loopback and returns both sides.
func newLoopbackPair(t *testing.T) loopbackPair {
	t.Helper()

	ta := &pipeTransport{in: make(chan Packet, 64)}
	tb := &pipeTransport{in: make(chan Packet, 64)}
	ta.peer = tb
	tb.peer = ta

	cliA := NewClient(ta, "/wp-cli")
	cliB := NewClient(tb, "/wp-cli")

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	go cliA.readLoop(ctx)
	go cliB.readLoop(ctx)

	ssA := NewStreamSocket(ctx, cliA)
	ssB := NewStreamSocket(ctx, cliB)

	return loopbackPair{ssA: ssA, cliA: cliA, ssB: ssB, cliB: cliB}
}

// script is a function that scripts the "server" (B) side when it receives a "cmd" event.
// args are the decoded arguments: [data, stdinStream, stdoutStream].
type script func(ctx context.Context, args []any, cliB *Client, ssB *StreamSocket)

// runWithScript runs run() on the A side while B executes the given script.
// Returns the Result and the captured stdout (combined with opts.Stdout).
func runWithScript(t *testing.T, s script) (Result, string) {
	t.Helper()
	t.Setenv("NO_COLOR", "1")

	pair := newLoopbackPair(t)

	var buf bytes.Buffer
	opts := Options{
		Stdin:  strings.NewReader(""), // empty stdin
		Stdout: &buf,
		Stderr: &buf,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)

	// Script the server side: register a "cmd" handler on ssB.
	// The handler will be called in its own goroutine (per StreamSocket.On dispatch).
	pair.ssB.On("cmd", func(args []any, ackID *int) {
		s(ctx, args, pair.cliB, pair.ssB)
	})

	// Run the inner function with the A-side client + StreamSocket.
	var offset atomic.Int64
	resCh := make(chan Result, 1)
	errCh := make(chan error, 1)
	go func() {
		res, err := run(ctx, opts, pair.cliA, pair.ssA, &offset, 0)
		if err != nil {
			errCh <- err
			return
		}
		resCh <- res
	}()

	select {
	case res := <-resCh:
		return res, buf.String()
	case err := <-errCh:
		t.Fatalf("run() returned error: %v", err)
		return Result{}, ""
	case <-time.After(4 * time.Second):
		t.Fatal("timeout waiting for run() to complete")
		return Result{}, ""
	}
}

// scriptExit returns a script that emits an exit event with the given code and message.
func scriptExit(code int, message string) script {
	return func(ctx context.Context, args []any, cliB *Client, ssB *StreamSocket) {
		_ = cliB.Emit(ctx, "exit", []any{map[string]any{
			"exitCode": float64(code),
			"message":  message,
		}}, nil)
	}
}

// scriptCancel returns a script that emits a cancel event with the given message.
func scriptCancel(message string) script {
	return func(ctx context.Context, args []any, cliB *Client, ssB *StreamSocket) {
		_ = cliB.Emit(ctx, "cancel", []any{message}, nil)
	}
}

// scriptError returns a script that emits an error event with the given message.
func scriptError(message string) script {
	return func(ctx context.Context, args []any, cliB *Client, ssB *StreamSocket) {
		_ = cliB.Emit(ctx, "error", []any{message}, nil)
		// After error we still need to signal exit so run() terminates.
		_ = cliB.Emit(ctx, "exit", []any{map[string]any{
			"exitCode": float64(1),
		}}, nil)
	}
}

// scriptStdout returns a script that writes data to the stdout stream (args[2]),
// closes it, then emits exit with the given code.
func scriptStdout(data string, code int) script {
	return func(ctx context.Context, args []any, cliB *Client, ssB *StreamSocket) {
		// args: [data(map), stdinStream(*IOStream), stdoutStream(*IOStream)]
		if len(args) < 3 {
			return
		}
		stdoutStream, ok := args[2].(*IOStream)
		if !ok {
			return
		}
		// Write data then close the stdout stream.
		_, _ = stdoutStream.Write([]byte(data))
		_ = stdoutStream.Close()
		// Emit exit to be deterministic.
		_ = cliB.Emit(ctx, "exit", []any{map[string]any{
			"exitCode": float64(code),
		}}, nil)
	}
}

func TestRunExitEvent(t *testing.T) {
	res, out := runWithScript(t, scriptExit(5, "done"))
	if res.ExitCode != 5 {
		t.Errorf("exit = %d, want 5", res.ExitCode)
	}
	if !strings.Contains(out, "done") {
		t.Errorf("message not printed: %q", out)
	}
}

func TestRunCancelEvent(t *testing.T) {
	res, out := runWithScript(t, scriptCancel("nope"))
	if res.ExitCode != 1 {
		t.Errorf("exit = %d, want 1", res.ExitCode)
	}
	if !strings.Contains(out, "Cancel received from server: nope") {
		t.Errorf("out = %q", out)
	}
}

func TestRunRateLimitError(t *testing.T) {
	_, out := runWithScript(t, scriptError("Rate limit exceeded"))
	if !strings.Contains(out, "Rate limit exceeded: Please wait a moment and try again.") {
		t.Errorf("out = %q", out)
	}
}

func TestRunStdoutStreamed(t *testing.T) {
	res, out := runWithScript(t, scriptStdout("line1\nline2\n", 0))
	if res.ExitCode != 0 {
		t.Errorf("exit = %d", res.ExitCode)
	}
	if !strings.Contains(out, "line1") || !strings.Contains(out, "line2") {
		t.Errorf("stdout not streamed: %q", out)
	}
}

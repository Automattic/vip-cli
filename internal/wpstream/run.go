package wpstream

import (
	"context"
	"encoding/json/v2"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand/v2"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fatih/color"
)

const (
	nonTTYColumns = 100 // NON_TTY_COLUMNS (vip-wp.js:42)
	nonTTYRows    = 15  // NON_TTY_ROWS    (vip-wp.js:43)
)

// errRunDone is injected into a stdout IOStream to interrupt a blocked Read
// when run() is about to return (exit/cancel received before stdout EOF).
var errRunDone = errors.New("wpstream: run done")

// Options configure a single Run.
type Options struct {
	APIHost    string
	Token      string
	GUID       string
	InputToken string
	Columns    int
	Rows       int
	IsTTY      bool // CR→LF stdin normalization when true (vip-wp.js:51)

	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
}

// Result carries the terminal outcome (the caller maps ExitCode to os.Exit).
type Result struct {
	ExitCode int
}

// Run connects and executes one WP-CLI command over socket.io.
// It implements the reconnect/offset loop: on disconnect (before an exit event
// arrives) it re-dials with exponential backoff and resumes from offset.
//
// C1/C2 fix: the loop is entirely self-contained; every Engine is explicitly
// closed before the next attempt or before returning. No goroutine is launched
// that outlives its engine.
func Run(ctx context.Context, opts Options) (Result, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var offset atomic.Int64
	backoff := time.Second
	const maxBackoff = 5 * time.Second
	first := true

	for {
		eng, err := Dial(ctx, DialOptions{
			BaseURL: opts.APIHost,
			Header:  bearerHeader(opts.Token),
		})
		if err != nil {
			if first {
				return Result{}, err
			}
			if werr := waitBackoff(ctx, &backoff, maxBackoff); werr != nil {
				return Result{}, werr
			}
			continue
		}

		cli := NewClient(eng, "/wp-cli")
		ss := NewStreamSocket(ctx, cli)

		// Install a retry handler: the server sends "retry" to signal it wants us to
		// reconnect. We close the engine after 5 s to force the disconnect.
		cli.On("retry", func(args []any) {
			go func() {
				select {
				case <-time.After(5 * time.Second):
				case <-ctx.Done():
					return
				}
				eng.Close()
			}()
		})

		if err := cli.Connect(ctx); err != nil {
			eng.Close()
			if first {
				return Result{}, err
			}
			if werr := waitBackoff(ctx, &backoff, maxBackoff); werr != nil {
				return Result{}, werr
			}
			continue
		}
		first = false

		res, clean := runOnce(ctx, opts, cli, ss, &offset, offset.Load())
		eng.Close() // C2: ALWAYS close engine before next attempt or return

		if ctx.Err() != nil {
			return Result{}, ctx.Err()
		}
		if clean {
			return res, nil
		}

		// disconnected mid-command → wait then reconnect from offset
		if werr := waitBackoff(ctx, &backoff, maxBackoff); werr != nil {
			return Result{}, werr
		}
		backoff = time.Second // reset after a successful (even if interrupted) attempt
	}
}

// waitBackoff sleeps for a jittered backoff duration, then doubles backoff up
// to max. Returns ctx.Err() if the context is cancelled during the wait.
func waitBackoff(ctx context.Context, backoff *time.Duration, max time.Duration) error {
	jitter := time.Duration(float64(*backoff) * (0.5 + rand.Float64()*0.5))
	select {
	case <-time.After(jitter):
	case <-ctx.Done():
		return ctx.Err()
	}
	*backoff = time.Duration(math.Min(float64(*backoff*2), float64(max)))
	return nil
}

// runOnce executes one attempt: registers handlers, launches the command,
// pipes stdio, and waits for exit, stdout EOF, disconnect, or ctx cancel.
//
// Returns (result, true) on clean exit, or (Result{}, false) on disconnect
// so the caller can reconnect. ctx cancel is treated as clean=true and the
// caller checks ctx.Err() afterwards.
func runOnce(ctx context.Context, opts Options, cli *Client, ss *StreamSocket, offset *atomic.Int64, resumeAt int64) (Result, bool) {
	// exitCh is buffered: handlers run in goroutines and MUST NOT block on send.
	exitCh := make(chan int, 4)
	signalExit := func(code int) {
		select {
		case exitCh <- code:
		default:
		}
	}

	cli.On("unauthorized", func(args []any) {
		fmt.Fprintln(opts.Stdout, "There was an error with the authentication:", errMessage(args))
	})
	cli.On("cancel", func(args []any) {
		fmt.Fprintf(opts.Stdout, "Cancel received from server: %s\n", strArg(args))
		signalExit(1)
	})
	cli.On("error", func(args []any) {
		if strArg(args) == "Rate limit exceeded" {
			fmt.Fprintln(opts.Stdout, color.RedString("\nError:"),
				"Rate limit exceeded: Please wait a moment and try again.")
			return
		}
		fmt.Fprintln(opts.Stdout, strArg(args))
	})
	cli.On("exit", func(args []any) {
		code, msg := parseExit(args)
		if msg != "" {
			fmt.Fprintln(opts.Stdout, msg)
		}
		signalExit(code)
	})

	disconnected := make(chan struct{}, 1)
	cli.On("disconnect", func(args []any) {
		select {
		case disconnected <- struct{}{}:
		default:
		}
	})

	stdoutDone := make(chan struct{})
	// runDone is closed when runOnce() is about to return, allowing the stdout
	// goroutine to exit even if the server never closes the stdout stream.
	runDone := make(chan struct{})
	var runDoneOnce sync.Once
	closeRunDone := func() { runDoneOnce.Do(func() { close(runDone) }) }

	stdinStream := ss.CreateStream()
	stdoutStream := ss.CreateStream()

	cols := opts.Columns
	if cols == 0 {
		cols = nonTTYColumns
	}
	rows := opts.Rows
	if rows == 0 {
		rows = nonTTYRows
	}
	data := map[string]any{
		"guid":       opts.GUID,
		"inputToken": opts.InputToken,
		"columns":    cols,
		"rows":       rows,
		"offset":     resumeAt,
	}
	_ = ss.Emit(ctx, "cmd", []any{data, stdinStream, stdoutStream}, nil)

	// Pipe stdin → stdinStream.
	// When stdinStream is aborted (C3) Write returns an error, io.Copy stops,
	// and the goroutine exits — no leak.
	go func() {
		src := opts.Stdin
		if opts.IsTTY && src != nil {
			src = crToLF{src}
		}
		if src != nil {
			_, _ = io.Copy(stdinStream, src)
		}
		_ = stdinStream.Close()
	}()

	// Background watcher: inject errRunDone into stdoutStream when runOnce is
	// about to return, unblocking the stdout goroutine.
	go func() {
		select {
		case <-runDone:
			stdoutStream.abort(errRunDone)
		case <-stdoutDone:
		}
	}()
	// Pipe stdoutStream → opts.Stdout, tracking byte offset.
	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, rerr := stdoutStream.Read(buf)
			if n > 0 {
				_, _ = opts.Stdout.Write(buf[:n])
				if offset != nil {
					offset.Add(int64(n))
				}
			}
			if rerr != nil {
				close(stdoutDone)
				return
			}
		}
	}()

	defer closeRunDone()

	var exitCode int
	select {
	case exitCode = <-exitCh:
		// Drain stdout: signal runDone so the watcher goroutine aborts the
		// stream, unblocking the stdout goroutine.
		closeRunDone()
		<-stdoutDone
		return Result{ExitCode: exitCode}, true
	case <-stdoutDone:
		// stdout EOF before any exit event — the server always sends an 'exit'
		// event after streaming completes (vip-wp.js:261). Wait briefly for it
		// so a non-zero exit code is not silently lost.
		select {
		case exitCode = <-exitCh:
		case <-time.After(2 * time.Second):
		case <-ctx.Done():
		}
		return Result{ExitCode: exitCode}, true
	case <-disconnected:
		// Transport dropped mid-command.
		// C3: abort all in-flight streams so blocked Read/Write goroutines exit.
		// We do this here (not in NewStreamSocket) to ensure the disconnected
		// channel is selected BEFORE stdoutDone can fire — preventing the race
		// where stdoutDone fires first and runOnce returns clean=true incorrectly.
		ss.abortAll(io.ErrUnexpectedEOF)
		closeRunDone() // also aborts stdoutStream via watcher (redundant but safe)
		return Result{}, false
	case <-ctx.Done():
		return Result{}, true // caller checks ctx.Err()
	}
}

// run is the internal single-attempt function used by the unit tests (run_test.go).
// The public API uses runOnce via Run. Kept for backward compatibility with tests.
func run(ctx context.Context, opts Options, cli *Client, ss *StreamSocket, offset *atomic.Int64, resumeAt int64) (Result, error) {
	res, clean := runOnce(ctx, opts, cli, ss, offset, resumeAt)
	if !clean {
		// disconnect treated as context cancellation for unit-test callers
		return Result{}, ctx.Err()
	}
	if ctx.Err() != nil {
		return Result{}, ctx.Err()
	}
	return res, nil
}

// crToLF replaces '\r' with '\n' (normalizeNewlineStream, vip-wp.js:51).
type crToLF struct{ r io.Reader }

func (c crToLF) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	for i := 0; i < n; i++ {
		if p[i] == '\r' {
			p[i] = '\n'
		}
	}
	return n, err
}

func bearerHeader(token string) http.Header {
	return http.Header{"Authorization": {"Bearer " + token}}
}

func parseExit(args []any) (int, string) {
	if len(args) == 0 {
		return 0, ""
	}
	m, ok := args[0].(map[string]any)
	if !ok {
		return 0, ""
	}
	code := 0
	if c, ok := m["exitCode"].(float64); ok {
		code = int(c)
	}
	msg, _ := m["message"].(string)
	return code, msg
}

func strArg(args []any) string {
	if len(args) == 0 {
		return ""
	}
	if s, ok := args[0].(string); ok {
		return s
	}
	b, _ := json.Marshal(args[0])
	return string(b)
}

func errMessage(args []any) string {
	if len(args) == 0 {
		return ""
	}
	if m, ok := args[0].(map[string]any); ok {
		if s, ok := m["message"].(string); ok {
			return s
		}
	}
	return strArg(args)
}

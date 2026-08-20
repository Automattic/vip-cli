// Package exit owns process termination.
//
// WithError prints a user-facing error to stderr and exits 1.
// WithCode exits with a specific code (for parity with the Node binary's
// per-command exit conventions).
//
// RegisterErrorHook lets the telemetry layer record errors before exit;
// in M1 the hook is a no-op. M2 wires telemetry.TrackError into it.
package exit

import (
	"errors"
	"fmt"
	"io"
	"os"
)

// alreadyPrinted marks an error whose user-facing message was deliberately
// written by the command itself. The process must still fail and telemetry
// must still observe it, but the shared exit path must not print it again.
type alreadyPrinted interface {
	AlreadyPrinted() bool
}

type handledError struct{ err error }

func (e handledError) Error() string      { return e.err.Error() }
func (e handledError) Unwrap() error      { return e.err }
func (handledError) AlreadyPrinted() bool { return true }

// Handled preserves a command error's non-zero exit while marking its message
// as already rendered for the user.
func Handled(err error) error {
	if err == nil {
		return nil
	}
	return handledError{err: err}
}

type exitFunc func(int)
type errorHook func(error)

// The package-level vars below are intentionally unsynchronized.
// RegisterErrorHook must be called once during single-threaded init,
// before any goroutine that may call WithError or WithCode is started.
// A signal handler that races with the main goroutine on these vars
// is unsupported in M1; M2 will revisit if needed.
var (
	stderr  io.Writer = os.Stderr
	exiter  exitFunc  = os.Exit
	errHook errorHook = func(error) {}
)

func WithError(err error) {
	writeAndExit(stderr, exiter, errHook, err)
}

func WithCode(code int, err error) {
	writeAndExitCode(stderr, exiter, errHook, code, err)
}

func RegisterErrorHook(h errorHook) {
	if h == nil {
		errHook = func(error) {}
		return
	}
	errHook = h
}

func writeAndExitCode(w io.Writer, ex exitFunc, hook errorHook, code int, err error) {
	if err != nil {
		hook(err)
		if !isAlreadyPrinted(err) {
			fmt.Fprintf(w, "Error: %s\n", err.Error())
		}
	}
	ex(code)
}

func writeAndExit(w io.Writer, ex exitFunc, hook errorHook, err error) {
	if err == nil {
		return
	}
	hook(err)
	if !isAlreadyPrinted(err) {
		fmt.Fprintf(w, "Error: %s\n", err.Error())
	}
	ex(1)
}

func isAlreadyPrinted(err error) bool {
	var marked alreadyPrinted
	return errors.As(err, &marked) && marked.AlreadyPrinted()
}

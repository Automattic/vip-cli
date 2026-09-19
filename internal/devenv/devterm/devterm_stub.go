//go:build windows

package devterm

import (
	"context"
	"errors"
	"io"
)

// Run (stub) — the real raw-mode PTY implementation lives in devterm_pty.go and
// is built on every non-Windows platform. Windows is excluded because the PTY
// path depends on Unix-only primitives (creack/pty, SIGWINCH, raw-mode termios),
// so it returns a clear unsupported error here.
func Run(_ context.Context, _ string, argv []string, _ io.Writer) error {
	if _, _, err := safeSplit(argv); err != nil {
		return err
	}
	return errors.New("devterm: interactive exec/shell is not supported on Windows")
}

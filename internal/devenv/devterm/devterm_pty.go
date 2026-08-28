//go:build !windows

package devterm

import (
	"context"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"syscall"

	"github.com/creack/pty"
	"golang.org/x/term"
)

// Run starts argv attached to a PTY, puts the host terminal in raw mode, copies
// stdin->pty and pty->MultiWriter(os.Stdout, logW), handles SIGWINCH, and
// restores the terminal on exit. The unified-log tee falls out of the
// MultiWriter. When dir is non-empty the child runs with that working directory
// (the env's materialized dir so `docker compose exec` finds its compose file).
// Built on every non-Windows platform; needs a controlling TTY at runtime
// (term.MakeRaw errors cleanly if stdin is not a terminal).
func Run(ctx context.Context, dir string, argv []string, logW io.Writer) error {
	name, rest, err := safeSplit(argv)
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, name, rest...)
	if dir != "" {
		cmd.Dir = dir
	}
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return err
	}
	defer func() { _ = ptmx.Close() }()

	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGWINCH)
	go func() {
		for range ch {
			_ = pty.InheritSize(os.Stdin, ptmx)
		}
	}()
	ch <- syscall.SIGWINCH // initial sizing
	defer signal.Stop(ch)

	oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
	if err != nil {
		return err
	}
	defer func() { _ = term.Restore(int(os.Stdin.Fd()), oldState) }()

	go func() { _, _ = io.Copy(ptmx, os.Stdin) }()
	_, _ = io.Copy(io.MultiWriter(os.Stdout, logW), ptmx)
	return cmd.Wait()
}

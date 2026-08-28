// Package devterm runs an interactive child process attached to a PTY and tees
// the PTY master to both the terminal and the unified dev-env log (spec §7.3).
// It is the §C "sharp edge" isolated here and reused by exec + shell.
//
// This file holds the cross-platform core: argv handling, the TTY check
// (Interactive), and the non-interactive RunPiped path (plain pipes, no PTY).
// The interactive raw-mode PTY run lives in devterm_pty.go (built on every
// non-Windows platform); Windows gets devterm_stub.go because that path needs
// Unix-only primitives (creack/pty, SIGWINCH, raw-mode termios).
package devterm

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"

	"golang.org/x/term"
)

// splitArgv splits a non-empty argv into the binary name and its arguments.
func splitArgv(argv []string) (string, []string) {
	return argv[0], argv[1:]
}

// safeSplit is splitArgv with an empty-argv guard, used by Run.
func safeSplit(argv []string) (string, []string, error) {
	if len(argv) == 0 {
		return "", nil, errors.New("devterm: empty argv")
	}
	name, rest := splitArgv(argv)
	return name, rest, nil
}

// Interactive reports whether stdin is a terminal. Callers use it to choose
// between the raw-mode PTY path (Run) and the plain-pipe path (RunPiped), and
// to decide whether to disable docker compose's default TTY allocation. This
// mirrors Node's dev-env, which gates interactivity on process.stdin.isTTY
// (vip-dev-env-shell.js / dev-environment-lando.ts landoShell).
func Interactive() bool {
	return term.IsTerminal(int(os.Stdin.Fd()))
}

// RunPiped runs argv with inherited stdin and the caller-provided stdout/stderr
// writers (which devexec wires to MultiWriter(os.Stdout, log) and
// MultiWriter(os.Stderr, log) so output both reaches the terminal and tees to
// the unified dev-env log). Unlike Run it allocates no PTY and touches no raw
// terminal state, so it works when stdout/stdin are pipes (e.g.
// `vip dev-env exec -- wp post list --format=json > out.json`) and on every
// platform, Windows included. When dir is non-empty the child runs there.
func RunPiped(ctx context.Context, dir string, argv []string, stdout, stderr io.Writer) error {
	name, rest, err := safeSplit(argv)
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, name, rest...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Stdin = os.Stdin
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	return cmd.Run()
}

package devenv

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/Automattic/vip/internal/devenv/devlog"
	"github.com/Automattic/vip/internal/devenv/devterm"
	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/devenv/paths"
)

// phpService is where wp-cli + WordPress live (verified against compose/services.go).
const phpService = "php"

// shellUserMap mirrors the Node dev-env shell userMap (vip-dev-env-shell.js).
var shellUserMap = map[string]string{
	"nginx": "www-data", "php": "www-data", "database": "mysql",
	"memcached": "memcache", "elasticsearch": "elasticsearch",
	"phpmyadmin": "www-data", "mailpit": "root", "photon": "root",
}

// shellUser resolves the container user for a shell: root when forced, else the
// service's mapped user, else www-data.
func shellUser(service string, root bool) string {
	if root {
		return "root"
	}
	if u, ok := shellUserMap[service]; ok {
		return u
	}
	return "www-data"
}

// execOpts returns the leading `exec` token(s). When noTTY is set (stdin is not
// a terminal) it appends -T to disable docker compose's default pseudo-TTY
// allocation, which would otherwise fail with "the input device is not a TTY"
// on piped stdin.
func execOpts(noTTY bool) []string {
	if noTTY {
		return []string{"exec", "-T"}
	}
	return []string{"exec"}
}

// execArgv builds `docker compose -p <slug> exec [-T] php wp --allow-root <wpArgs...>`.
// --allow-root is required because the php container runs as root, so wp-cli
// would otherwise refuse with "YIKES! running as root".
func execArgv(r *dockercli.Runner, slug string, wpArgs []string, noTTY bool) []string {
	args := append(execOpts(noTTY), phpService, "wp", "--allow-root")
	args = append(args, wpArgs...)
	return r.ComposeArgv(slug, args...)
}

// defaultShellCmd is the command run when `dev-env shell` is given no explicit
// command. It mirrors Node's landoShell (vip-dev-env-shell.js ->
// dev-environment-lando.ts): prefer bash so the container's interactive profile
// (the VIP banner, colored prompt, and aliases) loads, falling back to sh for
// service containers (e.g. database) that ship no bash. The -i flag is passed
// only when interactive, matching Node's stdin.isTTY check (-i vs no flag).
func defaultShellCmd(interactive bool) []string {
	flag := ""
	if interactive {
		flag = " -i"
	}
	script := fmt.Sprintf("if [ -x /bin/bash ]; then /bin/bash%s; else /bin/sh%s; fi; exit 0", flag, flag)
	return []string{"/bin/sh", "-c", script}
}

// shellArgv builds `docker compose -p <slug> exec [-T] -u <user> <service> [cmd...|default-shell]`.
func shellArgv(r *dockercli.Runner, slug, service string, root bool, cmd []string, noTTY bool) []string {
	args := append(execOpts(noTTY), "-u", shellUser(service, root), service)
	if len(cmd) > 0 {
		args = append(args, cmd...)
	} else {
		args = append(args, defaultShellCmd(!noTTY)...)
	}
	return r.ComposeArgv(slug, args...)
}

// Exec runs a WP-CLI command against an env. With a terminal on stdin it runs
// interactively through the raw-mode PTY; with piped stdin (e.g. redirecting
// output to a file) it runs through plain pipes. Either way output tees into
// the unified log.
func Exec(ctx context.Context, slug string, wpArgs []string) error {
	r, err := newRunner(ctx)
	if err != nil {
		return err
	}
	l, err := devlog.Open(slug)
	if err != nil {
		return err
	}
	defer l.Close()
	interactive := devterm.Interactive()
	argv := execArgv(r, slug, wpArgs, !interactive)
	return runTermOrPipe(ctx, l, paths.EnvironmentPath(slug), argv, interactive)
}

// Shell opens an interactive shell (or runs cmd) in a service container. Like
// Exec it falls back to plain pipes when stdin is not a terminal.
func Shell(ctx context.Context, slug, service string, root bool, cmd []string) error {
	r, err := newRunner(ctx)
	if err != nil {
		return err
	}
	l, err := devlog.Open(slug)
	if err != nil {
		return err
	}
	defer l.Close()
	interactive := devterm.Interactive()
	argv := shellArgv(r, slug, service, root, cmd, !interactive)
	return runTermOrPipe(ctx, l, paths.EnvironmentPath(slug), argv, interactive)
}

// runTermOrPipe dispatches a built compose-exec argv to either the raw-mode PTY
// runner (interactive) or the plain-pipe runner (non-interactive). The pipe
// path opens a separate log writer per stream, as devlog.Writer requires (its
// per-writer line buffer is single-goroutine; the underlying file is
// serialized), so the subprocess's stdout and stderr each tee into the log.
func runTermOrPipe(ctx context.Context, l *devlog.Logger, dir string, argv []string, interactive bool) error {
	if interactive {
		w := l.Writer()
		defer w.Close()
		return devterm.Run(ctx, dir, argv, w)
	}
	outLog := l.Writer()
	defer outLog.Close()
	errLog := l.Writer()
	defer errLog.Close()
	return devterm.RunPiped(ctx, dir, argv,
		io.MultiWriter(os.Stdout, outLog),
		io.MultiWriter(os.Stderr, errLog))
}

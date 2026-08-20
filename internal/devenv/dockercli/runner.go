package dockercli

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/Automattic/vip/internal/devenv/devlog"
	"github.com/Automattic/vip/internal/devenv/paths"
)

// Runner executes docker / docker compose commands, tee-ing child stdout and
// stderr to both the terminal and the unified log (spec §7.3). It is the Go
// replacement for Lando's Shell.sh tee + command/exit-code trace.
type Runner struct {
	Log         *devlog.Logger
	Stdout      io.Writer // defaults to os.Stdout
	Stderr      io.Writer // defaults to os.Stderr
	DockerBin   string    // docker executable; defaults to "docker"
	composeOnce sync.Once
	composeCmd  []string
}

// lockedWriter wraps an io.Writer with a shared mutex pointer so multiple
// lockedWriter instances covering the same underlying writer (e.g. when
// Stdout and Stderr both point to the same bytes.Buffer) share one lock.
// os/exec drives cmd.Stdout and cmd.Stderr from separate goroutines, so
// without the lock concurrent writes to a non-goroutine-safe writer race.
type lockedWriter struct {
	mu *sync.Mutex
	w  io.Writer
}

func (lw *lockedWriter) Write(p []byte) (int, error) {
	lw.mu.Lock()
	defer lw.mu.Unlock()
	return lw.w.Write(p)
}

func (r *Runner) out() io.Writer {
	if r.Stdout != nil {
		return r.Stdout
	}
	return os.Stdout
}

func (r *Runner) err() io.Writer {
	if r.Stderr != nil {
		return r.Stderr
	}
	return os.Stderr
}

// dockerBin returns the configured docker binary or the default.
func (r *Runner) dockerBin() string {
	if r.DockerBin != "" {
		return r.DockerBin
	}
	return "docker"
}

// ComposeArgs builds the argument list (minus the leading binary) for a
// compose invocation scoped to a project. For the plugin form the list begins
// with "compose"; for the standalone form it begins with "-p" directly.
func (r *Runner) ComposeArgs(project string, args ...string) []string {
	inv := r.composeInv()
	out := append([]string{}, inv[1:]...) // "compose" for plugin, nothing for standalone
	out = append(out, "-p", project)
	return append(out, args...)
}

// ComposeArgv builds the FULL argv (including the leading docker/compose
// binary) for a compose invocation scoped to a project. Unlike ComposeArgs
// (which omits the binary because Runner.run supplies it), this is for callers
// that hand a complete argv to another exec mechanism — the PTY tee in
// internal/devenv/devterm for interactive exec/shell.
func (r *Runner) ComposeArgv(project string, args ...string) []string {
	inv := r.composeInv()
	out := append([]string{}, inv...) // binary (+ "compose" for the plugin form)
	out = append(out, "-p", project)
	return append(out, args...)
}

// SetComposeCmdForTest pins the resolved compose invocation. Test-only seam so
// other packages can build deterministic argv without a real docker install.
func (r *Runner) SetComposeCmdForTest(inv []string) {
	r.composeCmd = inv
	r.composeOnce.Do(func() {})
}

// Docker runs `docker <args...>`.
func (r *Runner) Docker(ctx context.Context, args ...string) error {
	return r.run(ctx, "", r.dockerBin(), args...)
}

// Compose runs the resolved compose binary scoped to a project, executing from
// the project's materialized directory so docker compose finds its
// docker-compose.yml (default discovery) and resolves the relative bind-mount
// paths (./config, ./uploads, .env, ...) against that directory.
func (r *Runner) Compose(ctx context.Context, project string, args ...string) error {
	inv := r.composeInv()
	return r.run(ctx, paths.EnvironmentPath(project), inv[0], r.ComposeArgs(project, args...)...)
}

// ComposeStdin runs a compose command scoped to a project with stdin streamed
// from r (used to pipe a SQL dump into `wp db-myloader --stream`). Output is
// tee'd like Compose.
func (r *Runner) ComposeStdin(ctx context.Context, project string, stdin io.Reader, args ...string) error {
	inv := r.composeInv()
	return r.runStdin(ctx, paths.EnvironmentPath(project), stdin, inv[0], r.ComposeArgs(project, args...)...)
}

// Versions probes docker/compose versions for the log banner. Failures are
// reported as "unknown" rather than errors (ports getDockerVersions,
// dev-environment-lando.ts:197-242). Output is captured, not tee'd.
func (r *Runner) Versions(ctx context.Context) devlog.DockerVersions {
	inv := r.composeInv()
	v := devlog.DockerVersions{
		Engine: "unknown", Compose: "unknown", ComposePlugin: "unknown",
		DockerBin: r.dockerBin(), ComposeBin: strings.Join(inv, " "),
	}
	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, r.dockerBin(), "info", "--format", "{{.ServerVersion}}")
	cmd.Stdout = &buf
	if err := cmd.Run(); err == nil {
		if s := strings.TrimSpace(buf.String()); s != "" {
			v.Engine = s
		}
	}
	buf.Reset()
	cmd = exec.CommandContext(ctx, inv[0], append(append([]string{}, inv[1:]...), "version", "--short")...)
	cmd.Stdout = &buf
	if err := cmd.Run(); err == nil {
		if s := strings.TrimSpace(buf.String()); s != "" {
			v.Compose = s
			v.ComposePlugin = s
		}
	}
	return v
}

// run executes a single command, tee-ing output to the terminal and the log
// and recording the command line + exit code. When dir is non-empty the child
// runs with that working directory (compose commands run from the env's
// materialized dir so docker compose finds its compose file). The tee writers
// are closed after the process exits so devlog flushes any buffered trailing
// partial line (docker output that ends without a newline).
func (r *Runner) run(ctx context.Context, dir, name string, args ...string) error {
	return r.runStdin(ctx, dir, nil, name, args...)
}

// runStdin is run() with an optional stdin source (used to stream a SQL dump
// into `docker compose exec -T … wp db-myloader --stream`). When stdin is nil
// it behaves exactly like run().
func (r *Runner) runStdin(ctx context.Context, dir string, stdin io.Reader, name string, args ...string) error {
	if r.Log != nil {
		r.Log.Logf("running: %s %s", name, strings.Join(args, " "))
	}

	cmd := exec.CommandContext(ctx, name, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	if stdin != nil {
		cmd.Stdin = stdin
	}

	// Wrap the terminal writers behind a shared mutex. os/exec drives
	// cmd.Stdout and cmd.Stderr from separate goroutines; if both point to
	// the same underlying writer (common in tests and when output is
	// redirected) concurrent writes race. One shared mutex covers both.
	termMu := &sync.Mutex{}
	termOut := &lockedWriter{mu: termMu, w: r.out()}
	termErr := &lockedWriter{mu: termMu, w: r.err()}

	var outTee, errTee io.WriteCloser
	if r.Log != nil {
		outTee = r.Log.Writer()
		errTee = r.Log.Writer()
		cmd.Stdout = io.MultiWriter(termOut, outTee)
		cmd.Stderr = io.MultiWriter(termErr, errTee)
	} else {
		cmd.Stdout = termOut
		cmd.Stderr = termErr
	}

	runErr := cmd.Run()

	// Flush buffered trailing partial lines into the log BEFORE recording the
	// exit code, so all command output precedes the "finished" line.
	if outTee != nil {
		_ = outTee.Close()
		_ = errTee.Close()
	}

	code := 0
	if runErr != nil {
		var ee *exec.ExitError
		if errors.As(runErr, &ee) {
			code = ee.ExitCode()
		} else {
			code = -1
		}
	}
	if r.Log != nil {
		r.Log.Logf("finished: %s, exit code %d", name, code)
	}
	return runErr
}

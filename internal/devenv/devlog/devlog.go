// Package devlog owns the per-environment dev-env command log. Every
// docker/docker compose invocation tees its output here via Writer(), and the
// CLI's own dev-env diagnostics are logged through Logf, so VIP and Docker
// output interleave in one per-invocation timestamped file — the behavior
// Lando's winston logger + shell tee provided before. Each invocation opens a
// fresh file under the environment's own logs/ directory (Node parity:
// getDevEnvLogFile -> vip-dev-env-<slug>-<timestamp>.log).
package devlog

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/Automattic/vip/internal/devenv/paths"
)

const logName = "vip-dev-env"

// Logger is a single open handle to one invocation's log file. Safe for
// concurrent writers (the tee from stdout and stderr run concurrently).
type Logger struct {
	mu   sync.Mutex
	f    *os.File
	path string
	tty  io.Writer // where Finish() prints the log-path footer
}

// Open creates the environment's logs/ directory and opens a fresh,
// per-invocation timestamped log file for appending.
func Open(slug string) (*Logger, error) {
	dir := paths.EnvLogDir(slug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	p := filepath.Join(dir, logFileName(slug, time.Now()))
	f, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, err
	}
	return &Logger{f: f, path: p, tty: os.Stderr}, nil
}

// logFileName builds vip-dev-env-<slug>-<timestamp>.log, matching Node's
// getDevEnvLogFile (formatDevEnvLogSlug + formatDevEnvLogTimestamp).
func logFileName(slug string, t time.Time) string {
	return fmt.Sprintf("%s-%s-%s.log", logName, formatLogSlug(slug), t.UTC().Format("20060102-150405"))
}

var logSlugInvalid = regexp.MustCompile(`[^a-z0-9_-]+`)

// formatLogSlug mirrors Node's formatDevEnvLogSlug: lowercase, replacing any
// run of disallowed characters with a single dash. An empty slug maps to "all".
func formatLogSlug(slug string) string {
	if slug == "" {
		return "all"
	}
	return logSlugInvalid.ReplaceAllString(strings.ToLower(slug), "-")
}

// Path returns the log file path.
func (l *Logger) Path() string { return l.path }

// Close closes the underlying file.
func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.f.Close()
}

// writeLine writes one prefixed line (no trailing newline in msg).
func (l *Logger) writeLine(level, msg string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	ts := time.Now().UTC().Format("2006-01-02T15:04:05Z")
	_, _ = fmt.Fprintf(l.f, "%s [%s] %s: %s\n", ts, logName, level, msg)
}

// Logf writes a single diagnostic line at INFO level.
func (l *Logger) Logf(format string, args ...any) {
	l.writeLine("INFO", fmt.Sprintf(format, args...))
}

// Writer returns an io.WriteCloser that splits input into lines and writes
// each complete line to the log with a prefix. A trailing partial line is
// held in a buffer and flushed when the writer is Closed — callers MUST
// Close the writer (after the subprocess exits) so a final non-newline-
// terminated line is not lost.
//
// Each returned writer is single-goroutine: its internal line buffer is not
// synchronized, so call Writer() once per concurrent stream (e.g. separate
// writers for a subprocess's stdout and stderr) rather than sharing one
// writer across goroutines. Writes to the underlying log file are serialized.
func (l *Logger) Writer() io.WriteCloser {
	return &lineWriter{log: l, level: "INFO"}
}

// DockerVersions holds the docker/compose versions shown in the banner.
type DockerVersions struct {
	Engine, Compose, ComposePlugin, DockerBin, ComposeBin string
}

// Banner is the diagnostic header written once at the top of a fresh log.
// Ports writeLogBanner (dev-environment-lando.ts:247-286); NODE is replaced
// by CLI/runtime since there is no Node runtime any more.
type Banner struct {
	Command string
	OS      string
	CLI     string
	Runtime string
	Docker  DockerVersions
	RAMGB   string
	CPUs    string
}

// WriteBanner appends the banner only if the log file is currently empty,
// matching Lando's "write banner when size == 0" behavior.
func (l *Logger) WriteBanner(b Banner) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	info, err := l.f.Stat()
	if err != nil {
		return err
	}
	if info.Size() > 0 {
		return nil
	}

	line := func(label, value string) string {
		return fmt.Sprintf("%-18s %s\n", label, value)
	}
	var sb []byte
	sb = append(sb, "=== VIP Dev Env Log ===\n"...)
	sb = append(sb, line("COMMAND", b.Command)...)
	sb = append(sb, line("OS", b.OS)...)
	sb = append(sb, line("CLI", b.CLI)...)
	sb = append(sb, line("RUNTIME", b.Runtime)...)
	sb = append(sb, line("DOCKER ENGINE", b.Docker.Engine)...)
	sb = append(sb, line("DOCKER COMPOSE", b.Docker.Compose)...)
	sb = append(sb, line("COMPOSE PLUGIN", b.Docker.ComposePlugin)...)
	sb = append(sb, line("DOCKER BIN", b.Docker.DockerBin)...)
	sb = append(sb, line("COMPOSE BIN", b.Docker.ComposeBin)...)
	sb = append(sb, line("RAM", b.RAMGB)...)
	sb = append(sb, line("CPU", b.CPUs)...)
	sb = append(sb, "===\n\n\n"...)

	_, err = l.f.Write(sb)
	return err
}

type lineWriter struct {
	log   *Logger
	level string
	buf   bytes.Buffer
}

func (w *lineWriter) Write(p []byte) (int, error) {
	w.buf.Write(p)
	for {
		line, err := w.buf.ReadString('\n')
		if err != nil {
			// No newline yet: put the partial back and wait for more.
			w.buf.Reset()
			w.buf.WriteString(line)
			break
		}
		w.log.writeLine(w.level, strings.TrimRight(line[:len(line)-1], "\r"))
	}
	return len(p), nil
}

// Close flushes any buffered partial (non-newline-terminated) line to the
// log so trailing output is never dropped.
func (w *lineWriter) Close() error {
	if w.buf.Len() > 0 {
		w.log.writeLine(w.level, w.buf.String())
		w.buf.Reset()
	}
	return nil
}

// SetFooterWriter overrides where Finish() writes (defaults to stderr).
// Used in tests; production passes os.Stderr.
func (l *Logger) SetFooterWriter(w io.Writer) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.tty = w
}

// Finish prints the "COMMAND LOG FILE <path>" footer so users can find the
// combined log. Ports registerLogPathOutput (dev-environment-lando.ts:146-171).
func (l *Logger) Finish() {
	l.mu.Lock()
	defer l.mu.Unlock()
	fmt.Fprintf(l.tty, "\n %-18s %s\n", "COMMAND LOG FILE", l.path)
}

// loggerCtxKey is the private context key under which a session Logger is
// carried so the docker runner can pick it up without signature churn.
type loggerCtxKey struct{}

// WithLogger returns a context carrying l, so newRunner can tee through it.
func WithLogger(ctx context.Context, l *Logger) context.Context {
	return context.WithValue(ctx, loggerCtxKey{}, l)
}

// FromContext returns the session Logger carried by ctx, or nil.
func FromContext(ctx context.Context) *Logger {
	l, _ := ctx.Value(loggerCtxKey{}).(*Logger)
	return l
}

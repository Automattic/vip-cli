package dockercli

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/devlog"
)

// TestRunHonorsDir proves the child process executes in the working directory
// passed to run — the fix for "no configuration file provided" (compose must
// run from the env's materialized dir, not the CLI's CWD).
func TestRunHonorsDir(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("requires a POSIX shell (/bin/pwd, /bin/sh)")
	}
	dir := t.TempDir()
	var out bytes.Buffer
	r := &Runner{Stdout: &out, Stderr: &out}
	if err := r.run(context.Background(), dir, "/bin/pwd"); err != nil {
		t.Fatalf("run: %v", err)
	}
	got, err := filepath.EvalSymlinks(strings.TrimSpace(out.String()))
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.EvalSymlinks(dir)
	if got != want {
		t.Fatalf("run executed in %q, want %q", got, want)
	}
}

func TestRunTeesStdoutToTerminalAndLog(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("requires a POSIX shell (/bin/sh)")
	}
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	l, err := devlog.Open("testslug")
	if err != nil {
		t.Fatal(err)
	}

	var term bytes.Buffer
	r := &Runner{Log: l, Stdout: &term, Stderr: &term}

	// Use /bin/sh so the test does not require docker to be installed.
	if err := r.run(context.Background(), "", "/bin/sh", "-c", "echo out-line; echo err-line 1>&2"); err != nil {
		t.Fatalf("run: %v", err)
	}
	l.Close()

	if !strings.Contains(term.String(), "out-line") || !strings.Contains(term.String(), "err-line") {
		t.Fatalf("terminal capture missing output: %q", term.String())
	}

	logBytes, err := os.ReadFile(l.Path())
	if err != nil {
		t.Fatal(err)
	}
	logStr := string(logBytes)
	if !strings.Contains(logStr, "out-line") || !strings.Contains(logStr, "err-line") {
		t.Fatalf("log missing tee'd output:\n%s", logStr)
	}
	if !strings.Contains(logStr, "running:") {
		t.Fatalf("log missing command trace:\n%s", logStr)
	}
	if !strings.Contains(logStr, "exit code 0") {
		t.Fatalf("log missing exit code:\n%s", logStr)
	}
}

// TestRunFlushesTrailingPartialLineToLog proves the Runner closes the tee
// writers after the subprocess exits, so a final line WITHOUT a trailing
// newline is still captured in the log (devlog.Writer() only flushes its
// buffered partial line on Close).
func TestRunFlushesTrailingPartialLineToLog(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("requires a POSIX shell (/bin/sh)")
	}
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	l, err := devlog.Open("testslug")
	if err != nil {
		t.Fatal(err)
	}
	var term bytes.Buffer
	r := &Runner{Log: l, Stdout: &term, Stderr: &term}
	if err := r.run(context.Background(), "", "/bin/sh", "-c", "printf 'no-trailing-newline'"); err != nil {
		t.Fatalf("run: %v", err)
	}
	l.Close()
	logBytes, err := os.ReadFile(l.Path())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(logBytes), "no-trailing-newline") {
		t.Fatalf("trailing partial line lost in log:\n%s", logBytes)
	}
}

func TestComposeArgsPrependsComposeSubcommandAndProject(t *testing.T) {
	// Pin the compose invocation to the plugin form so the test is not
	// sensitive to whether docker compose is installed on the host.
	r := &Runner{}
	r.composeCmd = []string{"docker", "compose"}
	r.composeOnce.Do(func() {}) // mark as done so composeInv() uses the pinned value

	got := r.ComposeArgs("myproject", "up", "-d")
	want := []string{"compose", "-p", "myproject", "up", "-d"}
	if len(got) != len(want) {
		t.Fatalf("ComposeArgs = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ComposeArgs[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestComposeArgvIncludesBinaryAndProject(t *testing.T) {
	r := &Runner{}
	r.composeCmd = []string{"docker", "compose"}
	r.composeOnce.Do(func() {})
	got := r.ComposeArgv("proj", "exec", "php", "sh")
	want := []string{"docker", "compose", "-p", "proj", "exec", "php", "sh"}
	if len(got) != len(want) {
		t.Fatalf("ComposeArgv = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ComposeArgv[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestVersionsDegradesGracefullyWhenDockerMissing(t *testing.T) {
	// Pin the compose invocation to the plugin form using a nonexistent binary
	// so both the engine probe AND the compose probe fail deterministically,
	// regardless of whether docker-compose standalone is installed on the host.
	r := &Runner{DockerBin: "definitely-not-a-real-docker-binary-xyz"}
	r.composeCmd = []string{"definitely-not-a-real-docker-binary-xyz", "compose"}
	r.composeOnce.Do(func() {}) // mark as done so composeInv() uses the pinned value
	v := r.Versions(context.Background())
	if v.Engine != "unknown" || v.Compose != "unknown" || v.ComposePlugin != "unknown" {
		t.Fatalf("expected unknown versions when docker is missing, got %+v", v)
	}
	if v.DockerBin != "definitely-not-a-real-docker-binary-xyz" {
		t.Fatalf("DockerBin not reflected: %q", v.DockerBin)
	}
	if v.ComposeBin != "definitely-not-a-real-docker-binary-xyz compose" {
		t.Fatalf("ComposeBin not as expected: %q", v.ComposeBin)
	}
}

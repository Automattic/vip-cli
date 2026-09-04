//go:build parity

package parity

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunSetsWorkingDirectory(t *testing.T) {
	dir := t.TempDir()
	// Do not spawn this test binary as a helper: its TestMain credential sweep
	// would delete the parent process's live differential credential.
	if err := os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module example.com/parity-cwd\n"), 0600); err != nil {
		t.Fatal(err)
	}
	canonical, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(canonical, "go.mod")
	result, err := Run(RunSpec{Binary: "go", Dir: dir, Argv: []string{"env", "GOMOD"}, Env: FixtureEnv(nil)})
	if err != nil {
		t.Fatal(err)
	}
	got, err := filepath.EvalSymlinks(strings.TrimSpace(result.Stdout))
	if err != nil || result.ExitCode != 0 || got != want {
		t.Fatalf("result %#v error %v", result, err)
	}
}

func TestRunCapturesStdoutAndExit(t *testing.T) {
	// Use `go env GOVERSION` as a trivially available command that prints
	// to stdout and exits 0 on every supported platform.
	res, err := Run(RunSpec{
		Binary: "go",
		Argv:   []string{"env", "GOVERSION"},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.ExitCode != 0 {
		t.Errorf("ExitCode = %d, want 0", res.ExitCode)
	}
	if !strings.HasPrefix(res.Stdout, "go1.") {
		t.Errorf("Stdout = %q, want prefix go1.", res.Stdout)
	}
}

func TestRunCapturesNonZeroExit(t *testing.T) {
	// `go env --bogus-flag` exits non-zero.
	res, err := Run(RunSpec{
		Binary: "go",
		Argv:   []string{"env", "--bogus-flag-no-such"},
	})
	if err != nil {
		t.Fatalf("Run should not return an error on non-zero exit: %v", err)
	}
	if res.ExitCode == 0 {
		t.Errorf("expected non-zero exit, got 0")
	}
	if res.Stderr == "" {
		t.Errorf("expected stderr output, got empty")
	}
}

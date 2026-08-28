//go:build parity

package parity

import (
	"strings"
	"testing"
)

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

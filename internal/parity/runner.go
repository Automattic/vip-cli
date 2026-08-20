//go:build parity

package parity

import (
	"bytes"
	"errors"
	"os/exec"
)

type RunSpec struct {
	Binary string
	Argv   []string
	Env    []string // KEY=VALUE
	Stdin  []byte
}

type RunResult struct {
	ExitCode int
	Stdout   string
	Stderr   string
}

// Run executes Binary with Argv and captures stdout, stderr, and the exit code.
// A non-zero exit is NOT returned as a Go error — it's a normal result that
// the diff engine will compare against the expected value. Real errors
// (binary not found, etc.) are returned as errors.
func Run(spec RunSpec) (*RunResult, error) {
	cmd := exec.Command(spec.Binary, spec.Argv...)
	cmd.Env = spec.Env
	if len(spec.Stdin) > 0 {
		cmd.Stdin = bytes.NewReader(spec.Stdin)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	res := &RunResult{
		Stdout: stdout.String(),
		Stderr: stderr.String(),
	}
	if err == nil {
		res.ExitCode = 0
		return res, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		res.ExitCode = exitErr.ExitCode()
		return res, nil
	}
	return nil, err
}

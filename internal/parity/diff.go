//go:build parity

package parity

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"regexp"
)

type DiffResult struct {
	Equal         bool
	ExitCodeDelta string
	StdoutDelta   string
	StderrDelta   string
}

func ApplyNormalizers(s string, rules []NormalizeRule) (string, error) {
	for _, r := range rules {
		re, err := regexp.Compile(r.Pattern)
		if err != nil {
			return "", fmt.Errorf("compile normalizer %q: %w", r.Pattern, err)
		}
		s = re.ReplaceAllString(s, r.Replacement)
	}
	return s, nil
}

func Diff(s *Scenario, a, b *RunResult) (*DiffResult, error) {
	aOut, err := ApplyNormalizers(a.Stdout, s.Normalize.Stdout)
	if err != nil {
		return nil, err
	}
	bOut, err := ApplyNormalizers(b.Stdout, s.Normalize.Stdout)
	if err != nil {
		return nil, err
	}
	aErr, err := ApplyNormalizers(a.Stderr, s.Normalize.Stderr)
	if err != nil {
		return nil, err
	}
	bErr, err := ApplyNormalizers(b.Stderr, s.Normalize.Stderr)
	if err != nil {
		return nil, err
	}

	res := &DiffResult{Equal: true}
	if a.ExitCode != b.ExitCode {
		res.Equal = false
		res.ExitCodeDelta = fmt.Sprintf("exit code: a=%d b=%d", a.ExitCode, b.ExitCode)
	}
	if aOut != bOut {
		res.Equal = false
		res.StdoutDelta = fmt.Sprintf("stdout diverges:\n--- a\n%s\n--- b\n%s", aOut, bOut)
	}
	if aErr != bErr {
		res.Equal = false
		res.StderrDelta = fmt.Sprintf("stderr diverges:\n--- a\n%s\n--- b\n%s", aErr, bErr)
	}
	if !res.Equal && s.ExpectedDrift != nil {
		got := driftSignature(a.ExitCode, aOut, aErr, b.ExitCode, bOut, bErr)
		if got != s.ExpectedDrift.Signature {
			return nil, fmt.Errorf("expected_drift signature mismatch: recorded=%s actual=%s", s.ExpectedDrift.Signature, got)
		}
	}
	return res, nil
}

func driftSignature(nodeExit int, nodeStdout, nodeStderr string, goExit int, goStdout, goStderr string) string {
	h := sha256.New()
	write := func(label string, value string) {
		_, _ = fmt.Fprintf(h, "%s:%d:", label, len(value))
		_, _ = io.WriteString(h, value)
	}
	write("node-exit", fmt.Sprintf("%d", nodeExit))
	write("node-stdout", nodeStdout)
	write("node-stderr", nodeStderr)
	write("go-exit", fmt.Sprintf("%d", goExit))
	write("go-stdout", goStdout)
	write("go-stderr", goStderr)
	return hex.EncodeToString(h.Sum(nil))
}

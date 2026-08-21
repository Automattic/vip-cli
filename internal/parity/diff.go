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

// ambientStderrRules strip environment-dependent noise from stderr before any
// comparison. This is not the same thing as a scenario's own normalize rules:
// those describe output a scenario chose to ignore, whereas these describe
// output that depends only on where the harness happens to be running.
//
// Keep this list tiny and each pattern anchored to a whole line. Every entry
// here is output the harness has been made blind to, so a pattern that is one
// character too broad silently stops catching real divergences.
var ambientStderrRules = []NormalizeRule{
	// On a headless Linux runner there is no D-Bus secret service, so vip-next
	// reports that it fell back to a 0600 credentials file. The Node CLI uses
	// configstore and has no equivalent concept, so it says nothing. Left in,
	// this one line failed 32 differential scenarios on Linux that all passed
	// on macOS, where a keychain is always available.
	//
	// The difference is real and user-visible on headless Linux; it is recorded
	// in docs/CUTOVER-BREAKING-CHANGES.md rather than here, because a divergence
	// that appears in every single scenario is a property of the environment,
	// not of any one command.
	{Pattern: `(?m)^warning: OS keyring unavailable; storing credentials in .*\n?`, Replacement: ""},
}

// normalizeStderr applies the ambient rules before the scenario's own, so that
// no scenario has to restate environment noise it never asked about.
func normalizeStderr(s string, rules []NormalizeRule) (string, error) {
	s, err := ApplyNormalizers(s, ambientStderrRules)
	if err != nil {
		return "", err
	}
	return ApplyNormalizers(s, rules)
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
	aErr, err := normalizeStderr(a.Stderr, s.Normalize.Stderr)
	if err != nil {
		return nil, err
	}
	bErr, err := normalizeStderr(b.Stderr, s.Normalize.Stderr)
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
			// Print what actually diverged, not just the hashes. A bare pair of
			// signatures tells you a blessed drift moved but not how, which turns
			// every mismatch into a bisect. This is the normalized output the
			// signature was taken over, so what you read here is exactly what was
			// hashed.
			return nil, fmt.Errorf(
				"expected_drift signature mismatch: recorded=%s actual=%s\n"+
					"normalized a (Node): exit=%d\n--- stdout\n%s\n--- stderr\n%q\n"+
					"normalized b (Go):   exit=%d\n--- stdout\n%s\n--- stderr\n%q",
				s.ExpectedDrift.Signature, got,
				a.ExitCode, aOut, aErr,
				b.ExitCode, bOut, bErr,
			)
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

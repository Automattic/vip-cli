//go:build parity

package parity

import (
	"strings"
	"testing"
)

func TestApplyNormalizersStdout(t *testing.T) {
	rules := []NormalizeRule{
		{Pattern: `vip-next \S+ \(commit \S+\)`, Replacement: `vip-next <VERSION> (commit <COMMIT>)`},
	}
	in := "vip-next 1.2.3 (commit abcdef1)\n"
	got, err := ApplyNormalizers(in, rules)
	if err != nil {
		t.Fatalf("ApplyNormalizers: %v", err)
	}
	want := "vip-next <VERSION> (commit <COMMIT>)\n"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestDiffResultEqualWhenNormalized(t *testing.T) {
	scenario := &Scenario{
		Argv: []string{"--version"},
	}
	scenario.Normalize.Stdout = []NormalizeRule{
		{Pattern: `vip-next \S+ \(commit \S+\)`, Replacement: `vip-next <X> (commit <Y>)`},
	}
	a := &RunResult{ExitCode: 0, Stdout: "vip-next 1.0.0 (commit abcd1234)\n"}
	b := &RunResult{ExitCode: 0, Stdout: "vip-next 1.0.0 (commit deadbeef)\n"}

	d, err := Diff(scenario, a, b)
	if err != nil {
		t.Fatalf("Diff: %v", err)
	}
	if !d.Equal {
		t.Errorf("expected Equal after normalization; got %+v", d)
	}
}

func TestDiffResultUnequalOnExitCode(t *testing.T) {
	scenario := &Scenario{Argv: []string{"--version"}}
	a := &RunResult{ExitCode: 0}
	b := &RunResult{ExitCode: 1}

	d, err := Diff(scenario, a, b)
	if err != nil {
		t.Fatalf("Diff: %v", err)
	}
	if d.Equal {
		t.Errorf("expected !Equal on differing exit codes; got Equal")
	}
	if d.ExitCodeDelta == "" {
		t.Errorf("expected ExitCodeDelta to describe the divergence")
	}
}

func TestDiffRejectsAnAcceptedDriftWhoseOutputFingerprintChanged(t *testing.T) {
	scenario := &Scenario{Argv: []string{"example"}}
	scenario.ExpectedDrift = &ExpectedDrift{
		Reason:    "intentional example",
		Signature: strings.Repeat("0", 64),
	}
	node := &RunResult{ExitCode: 0, Stdout: "node output\n"}
	goResult := &RunResult{ExitCode: 0, Stdout: "go output\n"}

	_, err := Diff(scenario, node, goResult)
	if err == nil || !strings.Contains(err.Error(), "expected_drift signature mismatch") {
		t.Fatalf("Diff error = %v, want expected_drift signature mismatch", err)
	}
}

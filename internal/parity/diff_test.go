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

// The keychain fallback notice is environment noise, not a behavioural
// divergence: on a headless Linux runner there is no D-Bus secret service, so
// vip-next reports that it fell back to a 0600 file and the Node CLI — which
// has no equivalent concept — says nothing. Before this was normalized away,
// it failed 32 of the differential scenarios on Linux while every one of them
// passed on a developer's macOS machine.
func TestDiffIgnoresTheAmbientKeychainFallbackNotice(t *testing.T) {
	scenario := &Scenario{Argv: []string{"app", "list"}}
	node := &RunResult{ExitCode: 0, Stdout: "same\n"}
	goResult := &RunResult{
		ExitCode: 0,
		Stdout:   "same\n",
		Stderr:   "warning: OS keyring unavailable; storing credentials in /home/runner/.config/vip/credentials.json (0600)\n",
	}

	d, err := Diff(scenario, node, goResult)
	if err != nil {
		t.Fatalf("Diff: %v", err)
	}
	if !d.Equal {
		t.Errorf("keychain fallback notice must not count as a divergence; got %+v", d)
	}
}

// The ambient rule is deliberately narrow. A real message on stderr — including
// one that merely mentions the keyring — must still diverge, or the normalizer
// would be hiding the very thing the harness exists to catch.
func TestDiffStillReportsRealStderrDivergence(t *testing.T) {
	scenario := &Scenario{Argv: []string{"app", "list"}}
	node := &RunResult{ExitCode: 0, Stdout: "same\n"}
	goResult := &RunResult{
		ExitCode: 0,
		Stdout:   "same\n",
		Stderr:   "Error: could not read credentials from the OS keyring\n",
	}

	d, err := Diff(scenario, node, goResult)
	if err != nil {
		t.Fatalf("Diff: %v", err)
	}
	if d.Equal {
		t.Error("a real stderr message must still diverge")
	}
	if d.StderrDelta == "" {
		t.Error("expected StderrDelta to describe the divergence")
	}
}

// The notice must be stripped before the drift signature is computed, or an
// accepted divergence would fingerprint differently on Linux than on macOS and
// every expected_drift scenario would fail on exactly one of the two.
func TestAmbientNoticeIsStrippedBeforeTheDriftSignature(t *testing.T) {
	mk := func(stderr string) (*Scenario, *RunResult, *RunResult) {
		s := &Scenario{Argv: []string{"app", "list"}}
		return s,
			&RunResult{ExitCode: 0, Stdout: "node\n"},
			&RunResult{ExitCode: 1, Stdout: "go\n", Stderr: stderr}
	}

	clean, a1, b1 := mk("")
	noisy, a2, b2 := mk("warning: OS keyring unavailable; storing credentials in /home/runner/.config/vip/credentials.json (0600)\n")

	// Capture the signature each case produces by asserting against a wrong one.
	sig := func(s *Scenario, a, b *RunResult) string {
		s.ExpectedDrift = &ExpectedDrift{Reason: "x", Signature: strings.Repeat("0", 64)}
		_, err := Diff(s, a, b)
		if err == nil {
			t.Fatal("expected a signature mismatch to read the actual signature from")
		}
		_, actual, found := strings.Cut(err.Error(), "actual=")
		if !found {
			t.Fatalf("unexpected error shape: %v", err)
		}
		return actual
	}

	if got, want := sig(noisy, a2, b2), sig(clean, a1, b1); got != want {
		t.Errorf("signature differs with the ambient notice present:\n with = %s\nwithout = %s", got, want)
	}
}

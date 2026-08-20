//go:build parity

package parity

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadScenarioVersionSmoke(t *testing.T) {
	s, err := LoadScenario("../../testdata/parity/version-smoke.yaml")
	if err != nil {
		t.Fatalf("LoadScenario: %v", err)
	}
	if s.Name != "version-smoke" {
		t.Errorf("Name = %q, want %q", s.Name, "version-smoke")
	}
	if len(s.Argv) != 1 || s.Argv[0] != "--version" {
		t.Errorf("Argv = %v, want [--version]", s.Argv)
	}
	if s.Expect.ExitCode != 0 {
		t.Errorf("Expect.ExitCode = %d, want 0", s.Expect.ExitCode)
	}
	if len(s.Normalize.Stdout) != 1 {
		t.Errorf("Normalize.Stdout has %d entries, want 1", len(s.Normalize.Stdout))
	}
}

func TestLoadScenarioRejectsExpectedDriftWithoutReason(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing-reason.yaml")
	if err := os.WriteFile(path, []byte("name: missing-reason\nargv: [whoami]\nexpected_drift: {}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := LoadScenario(path)
	if err == nil || !strings.Contains(err.Error(), "non-empty reason") {
		t.Fatalf("LoadScenario error = %v, want non-empty reason error", err)
	}
}

func TestLoadScenarioRejectsExpectedDriftWithoutSignature(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing-signature.yaml")
	data := "name: missing-signature\nargv: [whoami]\nexpected_drift:\n  reason: intentional output difference\n"
	if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := LoadScenario(path)
	if err == nil || !strings.Contains(err.Error(), "64-character signature") {
		t.Fatalf("LoadScenario error = %v, want missing signature error", err)
	}
}

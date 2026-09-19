package e2esafety

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDestructivePackagesHavePackageLevelGate(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", "..", ".."))
	for _, rel := range []string{
		"internal/devenv/e2e_gate_test.go",
		"internal/devenv/hostops/e2e_gate_test.go",
		"cmd/vip-next/commands/devenv_e2e_gate_test.go",
	} {
		b, err := os.ReadFile(filepath.Join(repoRoot, rel))
		if err != nil {
			t.Errorf("%s: %v", rel, err)
			continue
		}
		source := string(b)
		if !strings.Contains(source, "func TestMain(m *testing.M)") {
			t.Errorf("%s has no package-level TestMain", rel)
		}
		if !strings.Contains(source, "e2esafety.Skip(os.Getenv, os.Stdout)") {
			t.Errorf("%s does not invoke the runtime opt-in gate", rel)
		}
	}
}

func TestDocumentationOnlyCommandGatesCannotReportPass(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", "..", ".."))
	path := filepath.Join(repoRoot, "cmd/vip-next/commands/devenv_e2e_test.go")
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	source := string(b)
	if strings.Contains(source, "t.Log(") {
		t.Fatal("documentation-only devenv_e2e functions must skip, not log and pass")
	}
	if got := strings.Count(source, "t.Skip("); got != 4 {
		t.Fatalf("documentation-only skip count = %d, want 4", got)
	}
}

func TestTaggedSuitesRequireCleanStateAndIdentityCheckedCleanup(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", "..", ".."))

	hostopsSource, err := os.ReadFile(filepath.Join(repoRoot, "internal/devenv/hostops/e2e_test.go"))
	if err != nil {
		t.Fatal(err)
	}
	hostops := string(hostopsSource)
	for _, required := range []string{"before.RequireClean()", "e2esafety.CanRemove", "teardownOwned"} {
		if !strings.Contains(hostops, required) {
			t.Errorf("hostops e2e is missing %q", required)
		}
	}
	for _, forbidden := range []string{"func preclean(", "proxy.Cleanup(ctx, r)"} {
		if strings.Contains(hostops, forbidden) {
			t.Errorf("hostops e2e still contains unsafe cleanup %q", forbidden)
		}
	}

	lifecycleSource, err := os.ReadFile(filepath.Join(repoRoot, "internal/devenv/e2e_test.go"))
	if err != nil {
		t.Fatal(err)
	}
	lifecycle := string(lifecycleSource)
	for _, required := range []string{"before.RequireClean()", "e2esafety.AllOwnedMatch", "cleanupLifecycleE2E"} {
		if !strings.Contains(lifecycle, required) {
			t.Errorf("lifecycle e2e is missing %q", required)
		}
	}
}

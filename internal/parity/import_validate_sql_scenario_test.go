//go:build parity

package parity

import (
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// TestM6bImportValidateSQLScenarios discovers every YAML matching
// import-validate-sql-* and runs the Go binary against it. Local-only
// validator: no mock GraphQL server needed.
func TestM6bImportValidateSQLScenarios(t *testing.T) {
	yamlDir := "../../testdata/parity"
	entries, err := filepath.Glob(yamlDir + "/import-validate-sql-*.yaml")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	sort.Strings(entries)
	if len(entries) == 0 {
		t.Fatal("no import-validate-sql scenarios found — testdata moved?")
	}

	goBin := buildVipNextWithVersion(t, "test", "test")

	for _, path := range entries {
		name := strings.TrimSuffix(filepath.Base(path), ".yaml")
		t.Run(name, func(t *testing.T) {
			scenario, err := LoadScenario(path)
			if err != nil {
				t.Fatalf("LoadScenario: %v", err)
			}
			if scenario.ExpectedDrift != nil {
				t.Skipf("expected drift (%s); skipping assertion", scenario.ExpectedDrift.Reason)
				return
			}
			res, err := Run(RunSpec{
				Binary: goBin,
				Argv:   scenario.Argv,
				Env:    FixtureEnv(scenario.Env),
			})
			if err != nil {
				t.Fatalf("Run: %v", err)
			}
			if res.ExitCode != scenario.Expect.ExitCode {
				t.Errorf("exit=%d, want %d; stderr=%q stdout=%q",
					res.ExitCode, scenario.Expect.ExitCode, res.Stderr, res.Stdout)
			}
			// Wire-level content assertions per scenario.
			switch name {
			case "import-validate-sql-clean":
				if !strings.Contains(res.Stdout, "clean") {
					t.Errorf("clean scenario stdout missing 'clean':\n%s", res.Stdout)
				}
			case "import-validate-sql-multisite-warn":
				if !strings.Contains(res.Stdout, "multi-site") {
					t.Errorf("multisite scenario stdout missing 'multi-site':\n%s", res.Stdout)
				}
			case "import-validate-sql-dangerous-stmt":
				if !strings.Contains(res.Stdout, "DROP DATABASE") {
					t.Errorf("dangerous-stmt scenario stdout missing DROP DATABASE finding:\n%s", res.Stdout)
				}
			}
		})
	}
}

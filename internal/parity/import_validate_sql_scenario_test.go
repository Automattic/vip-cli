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

func TestImportValidateSQLOptionsRowsDifferential(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("options row differential", skip))
	}
	scenario := &Scenario{
		Name: "options-rows",
		Argv: []string{"import", "validate-sql", "../../testdata/parity/recordings/import-validate-sql-options-rows/options.sql"},
		Env:  map[string]string{"DO_NOT_TRACK": "1", "NODE_ENV": "test"},
	}
	scenario.Env = rig.scenarioEnv(scenario)
	for _, side := range []struct{ name, binary string }{{"node", rig.nodeBin}, {"go", rig.goBin}} {
		result, _ := rig.runSide(t, scenario, side.binary, nullMux)
		if result.ExitCode != 0 || !strings.Contains(result.Stdout, "home https://real.example/#part") ||
			!strings.Contains(result.Stdout, "home https://multiline.example/#part") ||
			!strings.Contains(result.Stdout, "home https://after-unrelated.example") ||
			!strings.Contains(result.Stdout, "home https://quoted-schema.example") ||
			!strings.Contains(result.Stdout, "siteurl https://quoted-comment-marker.example") ||
			strings.Contains(result.Stdout, "https://unrelated.example") || strings.Contains(result.Stdout, "clause.example") ||
			strings.Contains(result.Stdout, "embedded-multiline.example") {
			t.Errorf("%s: exit=%d stdout=%q stderr=%q", side.name, result.ExitCode, result.Stdout, result.Stderr)
		}
	}
}

func TestImportValidateSQLEngineDifferential(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("SQL engine differential", skip))
	}
	for _, tc := range []struct {
		name, diagnostic string
		exit             int
		noEngineFinding  bool
	}{
		{"clean", "ENGINE != InnoDB was found 0 times.", 0, true},
		{"bad", "ENGINE != InnoDB on line(s) 5, 6.", 1, false},
		{"order", "ALTER TABLE statement on line(s) 3.", 1, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			scenario := &Scenario{Name: "sql-engine-" + tc.name, Argv: []string{"import", "validate-sql", "../../testdata/parity/recordings/sql-engine-validation/" + tc.name + ".sql"}, Env: map[string]string{"DO_NOT_TRACK": "1", "NODE_ENV": "test"}}
			scenario.Env = rig.scenarioEnv(scenario)
			for _, side := range []struct{ name, binary string }{{"node", rig.nodeBin}, {"go", rig.goBin}} {
				result, _ := rig.runSide(t, scenario, side.binary, nullMux)
				output := result.Stdout + result.Stderr
				if result.ExitCode != tc.exit || !strings.Contains(output, tc.diagnostic) || (tc.noEngineFinding && strings.Contains(output, "ENGINE != InnoDB on line(s)")) {
					t.Errorf("%s: exit=%d stdout=%q stderr=%q", side.name, result.ExitCode, result.Stdout, result.Stderr)
				}
			}
		})
	}
}

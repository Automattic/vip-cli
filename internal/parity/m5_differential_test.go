//go:build parity

package parity

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// m5DifferentialScenarios is the vetted allowlist of M5 scenarios that run as
// REAL Node-vs-Go differentials: both CLIs are executed against the same
// httptest mock and stdout+stderr+exit-code are diffed.
//
// TestM5Scenarios (m5_scenarios_test.go) runs the same YAML against vip-next
// ONLY, and asserts nothing but the exit code. That is a Go-behaviour test
// wearing a parity build tag — it is how the `--format=keyValue` shape
// divergence survived a review. Membership here is what makes a scenario
// actually compare the two implementations.
//
// A scenario belongs here only if all three hold:
//
//  1. read-only and side-effect free (no mutation reaches the mock),
//  2. the mock already serves every operation BOTH CLIs issue,
//  3. the Node CLI needs no credential beyond the one the rig seeds.
//
// Everything else must be listed in m5DifferentialExclusions with a reason.
// TestEveryM5ScenarioIsClassified fails when a scenario appears in neither, so
// a new YAML cannot quietly opt out of the differential.
var m5DifferentialScenarios = []string{
	// `app list` — the review's named high-signal target. Covers the default
	// table renderer plus the three --format branches and the empty case.
	"app-list-baseline",
	"app-list-json",
	"app-list-csv",
	"app-list-empty",
	// Two --format branches the review named that had no scenario at all.
	"app-list-ids",
	"app-list-unknown-format",

	// `config envvar list` — the format matrix the keyValue divergence hid in.
	"envvar-list-baseline",
	"envvar-list-json",
	"envvar-list-keyvalue",
	"envvar-list-ids",
	"envvar-list-empty",

	// `config envvar get-all` — second keyValue surface (key + value columns).
	"envvar-getall-baseline",
	"envvar-getall-keyvalue",
	"envvar-getall-empty",

	// `config envvar get` — single-value read path. envvar-get-named-help is
	// the cutover-2.13 repro: the positional is a VARIABLE named "help", not a
	// help request, so it is an ordinary read and belongs here.
	"envvar-get-baseline",
	"envvar-get-not-found",
	"envvar-get-lowercase-input",
	"envvar-get-named-help",

	// `logs` — the review flagged tab mangling and a `__typename` column shift.
	"logs-baseline",
	"logs-format-json",
	"logs-empty",
	"logs-batch",
	"logs-limit-100",

	// `slowlogs` — same renderer family, independent query.
	"slowlogs-baseline",
	"slowlogs-csv",
	"slowlogs-empty",
	"slowlogs-limit-50",

	// `app get` — read-only app lookup. app-get-custom-deploy is named for the
	// environment's deploymentStrategy in the recording, not for a deploy
	// token; it needs no credential beyond the seeded one.
	"app-get-baseline",
	"app-get-json",
	"app-get-not-found",
	"app-get-custom-deploy",
}

// m5DifferentialExclusions records M5 scenarios deliberately NOT run as
// differentials, each with the reason. Keep the reason specific: "flaky" is not
// a reason, "Node authenticates with a deploy token the fixture env does not
// carry" is. Verify the reason against the scenario's YAML and the Node source
// before adding an entry — a plausible-sounding reason that turns out to be
// wrong is how coverage silently disappears.
//
// Currently empty: every M5 scenario runs as a real differential.
var m5DifferentialExclusions = map[string]string{}

func TestM5DifferentialParity(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestM5DifferentialParity — every M5 Node-vs-Go differential scenario", skip))
	}

	for _, name := range m5DifferentialScenarios {
		// No t.Parallel: subtests swap the shared server's handler.
		t.Run(name, func(t *testing.T) {
			path := "../../testdata/parity/" + name + ".yaml"
			scenario, err := LoadScenario(path)
			if err != nil {
				t.Fatalf("LoadScenario(%s): %v", path, err)
			}

			rig.serve(t, m5Mux(t, scenario.Recording))
			scenario.Env = rig.scenarioEnv(scenario)

			d, err := CompareBinaries(scenario, rig.nodeBin, rig.goBin)
			if err != nil {
				t.Fatalf("CompareBinaries(%s): %v", name, err)
			}
			if d.Equal {
				if scenario.ExpectedDrift != nil {
					t.Errorf("%s carries expected_drift (%s) but Node and Go now agree. "+
						"Delete the annotation.", name, scenario.ExpectedDrift.Reason)
				}
				return
			}

			// A divergence is a FINDING. It may only be downgraded to a note by
			// an explicit, reasoned and fingerprinted expected_drift in the scenario YAML — which
			// is a decision about product behaviour, recorded next to the
			// scenario, not something the harness may infer.
			report := "Node vs Go diverge (argv: %v):\n  %s\n  %s\n  %s"
			if scenario.ExpectedDrift != nil {
				// Announced on stderr as well as via t.Log so it survives into
				// any run that keeps output. `go test` discards a PASSING
				// package's output entirely without -v, which is why
				// `make test-parity-unit` also prints the blessed list up front
				// (blessed-drift-status), reading the same YAML annotations.
				fmt.Fprintf(os.Stderr, "parity: BLESSED DRIFT %s — %s\n",
					name, strings.Join(strings.Fields(scenario.ExpectedDrift.Reason), " "))
				t.Logf("BLESSED DRIFT — "+scenario.ExpectedDrift.Reason+"\n"+report,
					scenario.Argv, d.ExitCodeDelta, d.StdoutDelta, d.StderrDelta)
				return
			}
			t.Errorf(report, scenario.Argv, d.ExitCodeDelta, d.StdoutDelta, d.StderrDelta)
		})
	}
}

// TestEveryM5ScenarioIsClassified is the anti-drift guard. Every M5 YAML must
// be either a differential or an explicitly-reasoned exclusion. Without it,
// adding a scenario silently produces another Go-vs-mock test that looks like
// parity coverage and is not.
func TestEveryM5ScenarioIsClassified(t *testing.T) {
	entries, err := filepath.Glob("../../testdata/parity/*.yaml")
	if err != nil {
		t.Fatalf("glob yaml: %v", err)
	}

	inDifferential := make(map[string]bool, len(m5DifferentialScenarios))
	for _, name := range m5DifferentialScenarios {
		inDifferential[name] = true
	}

	var seen int
	for _, path := range entries {
		base := strings.TrimSuffix(filepath.Base(path), ".yaml")
		if !isM5Scenario(base) {
			continue
		}
		seen++
		if inDifferential[base] {
			continue
		}
		if reason, ok := m5DifferentialExclusions[base]; ok {
			if strings.TrimSpace(reason) == "" {
				t.Errorf("%s is excluded from the differential with an empty reason", base)
			}
			continue
		}
		t.Errorf("M5 scenario %s runs against the mock only. Add it to "+
			"m5DifferentialScenarios, or to m5DifferentialExclusions with a reason "+
			"saying why Node cannot run it.", base)
	}
	if seen == 0 {
		t.Fatal("no M5 scenarios found — testdata may have moved")
	}
}

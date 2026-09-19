//go:build parity

package parity

import (
	"net/http"
	"os"
	"strconv"
	"testing"
)

// TestWhoamiBaselineParity runs the real Node CLI and diffs it against
// vip-next. It was for a long time the ONLY such test; TestM5DifferentialParity
// (m5_differential_test.go) now covers the read-only M5 command surface the
// same way. Everything else still compares vip-next against a mock, i.e. tests
// Go behaviour, not parity.
//
// `make test-parity-unit` points NODE_VIP_BIN at ./dist/bin/vip.js so this
// actually executes; when the Node CLI genuinely cannot run it skips with a
// banner naming what is missing, never silently. CI additionally runs
// `make require-node-vip-bin`, which fails the job outright rather than letting
// a skipped differential pass for a green one.
func TestWhoamiBaselineParity(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestWhoamiBaselineParity — the whoami Node-vs-Go differential", skip))
	}

	resp, err := os.ReadFile("../../testdata/parity/recordings/whoami-baseline/me-response.json")
	if err != nil {
		t.Fatalf("read recording: %v", err)
	}
	rig.serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(resp)
	}))

	scenario, err := LoadScenario("../../testdata/parity/whoami-baseline.yaml")
	if err != nil {
		t.Fatalf("LoadScenario: %v", err)
	}
	scenario.Env = rig.scenarioEnv(scenario)

	// If the shared keychain seed had silently done nothing, Node would fall
	// through to its login banner and this would fail loudly — there is no path
	// where a broken seed looks like a pass.
	t.Logf("test token id=%s", strconv.FormatInt(fixtureTokenUserID, 10))

	d, err := CompareBinaries(scenario, rig.nodeBin, rig.goBin)
	if err != nil {
		t.Fatalf("CompareBinaries: %v", err)
	}
	if !d.Equal {
		t.Errorf("Node vs Go diverge:\n  ExitCodeDelta: %s\n  StdoutDelta: %s\n  StderrDelta: %s",
			d.ExitCodeDelta, d.StdoutDelta, d.StderrDelta)
	}
}

// makeTestToken is the scenario-level alias for FixtureToken — the same
// deterministic credential ScenarioEnv pins into the base environment. It
// exists so a mock-only scenario can state its auth requirement explicitly at
// the call site rather than relying on the base env. Differential scenarios use
// the rig's token instead, so that Node's seeded credential and Go's env
// override are the same string.
func makeTestToken(t *testing.T) string {
	t.Helper()
	t.Logf("test token id=%s", strconv.FormatInt(fixtureTokenUserID, 10))
	return FixtureToken()
}

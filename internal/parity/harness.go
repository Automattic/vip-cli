//go:build parity

package parity

import (
	"fmt"
)

// CompareBinaries runs Argv against binA and binB under the same env,
// applies the scenario's normalizers, and diffs.
//
// The subprocess env is the scrubbed fixture base (see FixtureEnv) plus any
// Scenario.Env entries, which win on conflict. It is deliberately NOT
// os.Environ(): a differential Node-vs-Go run inherits ambient credentials
// and proxies otherwise, which makes the comparison depend on whose laptop
// it ran on.
func CompareBinaries(s *Scenario, binA, binB string) (*DiffResult, error) {
	env := FixtureEnv(s.Env)
	resA, err := Run(RunSpec{Binary: binA, Argv: s.Argv, Env: env})
	if err != nil {
		return nil, fmt.Errorf("run a (%s): %w", binA, err)
	}
	resB, err := Run(RunSpec{Binary: binB, Argv: s.Argv, Env: env})
	if err != nil {
		return nil, fmt.Errorf("run b (%s): %w", binB, err)
	}
	return Diff(s, resA, resB)
}

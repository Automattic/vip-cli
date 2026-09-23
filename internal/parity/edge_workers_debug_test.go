//go:build parity

package parity

import (
	json "encoding/json/v2"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

// This catches debug flags being parsed but never connected to the transport,
// namespace filters being ignored, and diagnostics contaminating JSON stdout.
func TestEdgeWorkersListDebugParity(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("Edge Workers debug real Node-vs-Go comparisons", skip))
	}
	for _, tc := range []struct {
		name     string
		flags    []string
		env      string
		wantHTTP bool
	}{
		{name: "disabled"},
		{name: "short", flags: []string{"-d"}, wantHTTP: true},
		{name: "long", flags: []string{"--debug"}, wantHTTP: true},
		{name: "matching", flags: []string{"--debug=@automattic/vip:http"}, wantHTTP: true},
		{name: "matching-separated", flags: []string{"--debug", "@automattic/vip:http"}, wantHTTP: true},
		{name: "nonmatching-separated", flags: []string{"-d", "unrelated:namespace"}},
		{name: "wildcard-exclusion", flags: []string{"--debug=*,-@automattic/vip:http"}},
		{name: "nonmatching", flags: []string{"--debug=unrelated:namespace"}},
		{name: "environment", env: "@automattic/vip:http", wantHTTP: true},
		{name: "flag-overrides-environment", env: "@automattic/vip:http", flags: []string{"--debug=unrelated:namespace"}},
		{name: "empty-flag-keeps-environment", env: "@automattic/vip:http", flags: []string{"--debug="}, wantHTTP: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var outputs [2]any
			for side, bin := range []string{rig.nodeBin, rig.goBin} {
				api := newEdgeFixtureAPI("inactive")
				// A list response has no reason to reveal stored source in diagnostics.
				api.workers[0]["source"] = "debug-parity-private-source"
				rig.serve(t, api)
				env := rig.scenarioEnv(&Scenario{Env: map[string]string{"DEBUG": tc.env}})
				args := append([]string{"edge-workers", "list", "--app=42", "--env=develop", "--format=json"}, tc.flags...)
				result, err := Run(RunSpec{Binary: bin, Dir: t.TempDir(), Argv: args, Env: FixtureEnv(env)})
				if err != nil {
					t.Fatal(err)
				}
				if result.ExitCode != 0 {
					t.Fatalf("side %d exited %d: %s", side, result.ExitCode, result.Stderr)
				}
				// Approved runtime banner difference, CUTOVER-BREAKING-CHANGES 1.10.
				stdout := regexp.MustCompile(`(?m)^Debug:  VIP-CLI v[^,\n]+, Node v[^,\n]+, [^,\n]+, Runtime node-script\n`).ReplaceAllString(result.Stdout, "")
				if err := json.Unmarshal([]byte(stdout), &outputs[side]); err != nil {
					t.Fatalf("side %d stdout is not JSON: %v\n%s", side, err, stdout)
				}
				count := 0
				for _, line := range strings.Split(result.Stderr, "\n") {
					if strings.Contains(line, "@automattic/vip:http running fetch "+rig.srv.URL+"/graphql") {
						count++
					}
				}
				wantCount := 0
				if tc.wantHTTP {
					wantCount = 2 // app resolution, then EdgeWorkers
				}
				if count != wantCount {
					t.Errorf("side %d HTTP diagnostics = %d, want %d; stderr:\n%s", side, count, wantCount, result.Stderr)
				}
				for _, secret := range []string{rig.token, "debug-parity-private-source", "Bearer ", `"variables":`, `"edgeWorkers":`} {
					if strings.Contains(result.Stderr, secret) {
						t.Errorf("side %d diagnostics exposed credential or payload data", side)
					}
				}
				ops, observations := api.snapshot()
				if len(ops) != 0 || len(observations) != 1 || observations[0].Operation != "EdgeWorkers" || observations[0].Source {
					t.Errorf("side %d did not perform exactly one source-free list: operations=%v requests=%v", side, ops, observations)
				}
			}
			if !reflect.DeepEqual(outputs[0], outputs[1]) {
				t.Errorf("JSON output differs: Node=%v Go=%v", outputs[0], outputs[1])
			}
		})
	}
}

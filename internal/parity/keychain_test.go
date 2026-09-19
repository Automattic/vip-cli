//go:build parity

package parity

import (
	"fmt"
	"os"
	"testing"
)

// realCredentialsOnDevMachines is the set of service names that belong to a
// human — a developer's actual login, a long-lived local Parker, the
// dead-loopback and hostile-proxy hosts the harness pins. Every one of them
// MUST be refused by the guard. This list is a TEST FIXTURE, not the guard's
// implementation: the guard is a positive match on the ephemeral shape and has
// no denylist, so adding a name here can only ever prove the property, never
// create it.
var realCredentialsOnDevMachines = []string{
	"vip-go-cli",
	"vip-go-cli-uuid",
	"vip-next-cli",
	"vip-next-cli-uuid",
	"vip-go-cli:http---127-0-0-1-4000-uuid",
	"vip-go-cli:http---localhost-4000",
	"vip-go-cli:http---localhost-4000-uuid",
	"vip-go-cli:http---127-0-0-1-9-uuid",
	"vip-next-cli:http---127-0-0-1-9-uuid",
	"vip-go-cli:http---127-0-0-1-1",
	"vip-go-cli:https---api-wpvip-com",
	"vip-next-cli:elevated",
	"vip-next-cli:elevated:https---api-wpvip-com",
}

// TestKeychainGuardRefusesRealCredentials is the safety property the whole
// keychain mechanism rests on. If this test ever goes red, the harness can
// delete a developer's live login.
func TestKeychainGuardRefusesRealCredentials(t *testing.T) {
	for _, name := range realCredentialsOnDevMachines {
		if IsEphemeralParityService(name) {
			t.Errorf("guard ACCEPTED a real credential %q — the harness could destroy it", name)
		}
		if err := assertEphemeralParityService("write", name); err == nil {
			t.Errorf("assertEphemeralParityService(write, %q) = nil, want refusal", name)
		}
		if err := assertEphemeralParityService("delete", name); err == nil {
			t.Errorf("assertEphemeralParityService(delete, %q) = nil, want refusal", name)
		}
	}
}

// TestKeychainMutatorsRefuseNonEphemeralNames proves the refusal is enforced at
// the mutating call sites, not merely available as a predicate. Neither call
// may reach /usr/bin/security.
func TestKeychainMutatorsRefuseNonEphemeralNames(t *testing.T) {
	const real = "vip-go-cli"

	if err := DeleteParityKeychainService(real); err == nil {
		t.Fatalf("DeleteParityKeychainService(%q) = nil, want refusal", real)
	}
	// SeedNodeKeychainToken derives the service from the host, so feed it a host
	// that yields the production name.
	if err := SeedNodeKeychainToken("/nonexistent/vip.js", nodeProductionAPIHost, "a.b.c"); err == nil {
		t.Fatal("SeedNodeKeychainToken against the production API host = nil, want refusal")
	}
	if err := CleanupParityKeychainServices([]string{real}); err == nil {
		t.Fatalf("CleanupParityKeychainServices([%q]) = nil, want refusal", real)
	}
}

func TestKeychainGuardAcceptsEphemeralScopedNames(t *testing.T) {
	accepted := []string{
		"vip-go-cli:http---127-0-0-1-63145",
		"vip-go-cli:http---127-0-0-1-63145-uuid",
		"vip-next-cli:http---127-0-0-1-61991",
		"vip-next-cli:elevated:http---127-0-0-1-62010",
		"vip-go-cli:http---127-0-0-1-32768",
		"vip-next-cli:http---127-0-0-1-65535",
	}
	for _, name := range accepted {
		if !IsEphemeralParityService(name) {
			t.Errorf("guard refused %q, which only an httptest server can produce", name)
		}
	}

	// Just below the ephemeral floor is refused: a port a human picked.
	if IsEphemeralParityService("vip-go-cli:http---127-0-0-1-32767") {
		t.Error("guard accepted port 32767, below the ephemeral floor")
	}
	// A port that cannot exist is refused rather than wrapped.
	if IsEphemeralParityService("vip-go-cli:http---127-0-0-1-65536") {
		t.Error("guard accepted port 65536")
	}
	// Suffixes and prefixes must not sneak past.
	for _, name := range []string{
		"xvip-go-cli:http---127-0-0-1-63145",
		"vip-go-cli:http---127-0-0-1-63145-uuid-extra",
		"vip-go-cli:http---127-0-0-1-63145:legacy-fallback-disabled",
		"vip-other-cli:http---127-0-0-1-63145",
	} {
		if IsEphemeralParityService(name) {
			t.Errorf("guard accepted %q", name)
		}
	}
}

// TestNodeKeychainServiceMatchesNodeDerivation pins the port of
// Token.getServiceName (src/lib/token.ts:119-129). If Node's derivation ever
// changes, the differential would silently authenticate nothing; this catches
// it at the unit level instead.
func TestNodeKeychainServiceMatchesNodeDerivation(t *testing.T) {
	cases := []struct {
		host, modifier, want string
	}{
		// PRODUCTION_API_HOST !== API_HOST is false -> bare SERVICE.
		{nodeProductionAPIHost, "", "vip-go-cli"},
		{nodeProductionAPIHost, "-uuid", "vip-go-cli-uuid"},
		// Everything else is suffixed with the sanitised host.
		{"http://127.0.0.1:63145", "", "vip-go-cli:http---127-0-0-1-63145"},
		{"http://127.0.0.1:63145", "-uuid", "vip-go-cli:http---127-0-0-1-63145-uuid"},
		{"http://localhost:4000", "", "vip-go-cli:http---localhost-4000"},
		// The /i flag on Node's regex means uppercase is alphanumeric too.
		{"https://API.WPVIP.com", "", "vip-go-cli:https---API-WPVIP-com"},
	}
	for _, tc := range cases {
		if got := NodeKeychainService(tc.host, tc.modifier); got != tc.want {
			t.Errorf("NodeKeychainService(%q, %q) = %q, want %q", tc.host, tc.modifier, got, tc.want)
		}
	}
}

// TestParityKeychainServicesCoversBothCLIs asserts the cleanup set names every
// entry a differential run can create, and that all of them clear the guard —
// an entry the guard would refuse is an entry cleanup cannot remove.
func TestParityKeychainServicesCoversBothCLIs(t *testing.T) {
	const host = "http://127.0.0.1:54321"
	got := ParityKeychainServices(host)

	want := map[string]bool{
		"vip-go-cli:http---127-0-0-1-54321":            false, // Node token (seeded here)
		"vip-go-cli:http---127-0-0-1-54321-uuid":       false, // Node analytics anon-id
		"vip-next-cli:http---127-0-0-1-54321":          false, // Go auth store
		"vip-next-cli:elevated:http---127-0-0-1-54321": false, // Go rechallenge cache
	}
	for _, name := range got {
		if _, ok := want[name]; !ok {
			t.Errorf("unexpected service %q in the cleanup set", name)
			continue
		}
		want[name] = true
		if !IsEphemeralParityService(name) {
			t.Errorf("cleanup set contains %q, which the guard refuses to delete", name)
		}
	}
	for name, seen := range want {
		if !seen {
			t.Errorf("cleanup set is missing %q", name)
		}
	}
}

// TestMain brackets the whole parity suite with credential cleanup.
//
// PRE-RUN SWEEP: collect entries left by a run that was killed before any
// cleanup could fire. POST-RUN: tear down the shared differential rig (which
// deletes the one credential the run seeded, through Node's own keychain layer
// so it works on any backend), then sweep again for entries the CLIs under
// test wrote for THEMSELVES — the Go binary creates its own vip-next-cli:<host>
// and vip-next-cli:elevated:<host> credentials during the login and rechallenge
// scenarios, which no named cleanup knows about.
//
// Order matters: the rig teardown must run before the sweep, so that anything
// it fails to remove is still caught by the sweep rather than surviving to the
// next run.
//
// Together this is what makes the `vip*` service count identical before and
// after `make test-parity-unit`, and keeps it identical as scenarios are added
// — the run seeds ONE credential regardless of how many differentials there
// are (see differential_test.go).
//
// Sweep failures are reported but never fail the suite: this is hygiene, not an
// assertion about the code under test.
func TestMain(m *testing.M) {
	reportSweep("pre-run (orphans from an interrupted run)")
	code := m.Run()
	teardownDifferentialRig()
	reportSweep("post-run (entries the CLIs under test created)")
	os.Exit(code)
}

func reportSweep(phase string) {
	removed, err := SweepEphemeralParityKeychain()
	if err != nil {
		// Not fatal: on Linux/CI there is no keychain to sweep, and a locked
		// keychain is the developer's business, not this suite's.
		fmt.Fprintf(os.Stderr, "parity keychain sweep %s: %v\n", phase, err)
	}
	// Service names are not secrets; the values under them are never read.
	for _, name := range removed {
		fmt.Fprintf(os.Stderr, "parity keychain sweep %s: removed %s\n", phase, name)
	}
}

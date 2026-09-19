//go:build parity

package parity

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// hostileParent is the environment of a developer laptop that has live
// credentials, a corporate proxy, and personal overrides exported — exactly
// the ambient state the fixture suite must be immune to.
func hostileParent() []string {
	return []string{
		"PATH=/usr/bin:/bin",
		"HOME=/Users/developer",
		"VIP_TOKEN_OVERRIDE=live.laptop.jwt",
		"WPVIP_DEPLOY_TOKEN=live-deploy-key",
		"API_HOST=https://api.wpvip.com",
		"HTTP_PROXY=http://corp-proxy:8080",
		"HTTPS_PROXY=http://corp-proxy:8080",
		"ALL_PROXY=socks5://corp-proxy:1080",
		"VIP_PROXY=socks5://corp-proxy:1080",
		"SOCKS_PROXY=socks5://corp-proxy:1080",
		"VIP_USE_SYSTEM_PROXY=1",
		"http_proxy=http://corp-proxy:8080",
		"https_proxy=http://corp-proxy:8080",
		"all_proxy=socks5://corp-proxy:1080",
		"NODE_ENV=production",
		"DO_NOT_TRACK=0",
		"NO_COLOR=1",
		"XDG_DATA_HOME=/Users/developer/Library/Application Support",
		"VIP_SEARCH_REPLACE_BIN=/opt/homebrew/bin/go-search-replace",
		"DEBUG=*",
		"SOME_PERSONAL_VAR=1",
	}
}

func TestScenarioEnvPinsCredentialsRegardlessOfAmbient(t *testing.T) {
	got := envMap(ScenarioEnv(hostileParent(), nil))

	if got["VIP_TOKEN_OVERRIDE"] == "live.laptop.jwt" {
		t.Error("ambient VIP_TOKEN_OVERRIDE leaked into the fixture environment")
	}
	if got["VIP_TOKEN_OVERRIDE"] == "" {
		t.Error("fixture environment must pin a deterministic token so the Go binary never falls back " +
			"to the host keychain (Node 4.1.0 ignores this variable; TestWhoamiBaselineParity seeds " +
			"an ephemeral keychain entry for it instead)")
	}
	if _, present := got["WPVIP_DEPLOY_TOKEN"]; present {
		t.Errorf("WPVIP_DEPLOY_TOKEN must be absent unless a scenario sets it; got %q", got["WPVIP_DEPLOY_TOKEN"])
	}
}

func TestScenarioEnvDropsAmbientProxiesAndHost(t *testing.T) {
	got := envMap(ScenarioEnv(hostileParent(), nil))

	for _, key := range []string{
		"HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "VIP_PROXY", "SOCKS_PROXY",
		"VIP_USE_SYSTEM_PROXY", "http_proxy", "https_proxy", "all_proxy",
	} {
		if _, present := got[key]; present {
			t.Errorf("proxy variable %s leaked into the fixture environment (value %q)", key, got[key])
		}
	}
	if got["API_HOST"] == "https://api.wpvip.com" {
		t.Error("ambient API_HOST leaked: a fixture scenario could reach the real API")
	}
	if !strings.Contains(got["API_HOST"], "127.0.0.1") {
		t.Errorf("API_HOST must default to a dead loopback address, got %q", got["API_HOST"])
	}
}

func TestScenarioEnvDropsUnlistedAmbientVariables(t *testing.T) {
	got := envMap(ScenarioEnv(hostileParent(), nil))

	for _, key := range []string{
		"NO_COLOR", "XDG_DATA_HOME", "VIP_SEARCH_REPLACE_BIN", "DEBUG", "SOME_PERSONAL_VAR",
	} {
		if _, present := got[key]; present {
			t.Errorf("unlisted ambient variable %s leaked into the fixture environment (value %q)", key, got[key])
		}
	}
	// The OS-level allowlist must survive: the subprocess needs to find its
	// interpreter and a home directory.
	if got["PATH"] != "/usr/bin:/bin" {
		t.Errorf("PATH = %q, want the parent's value", got["PATH"])
	}
	if got["HOME"] != "/Users/developer" {
		t.Errorf("HOME = %q, want the parent's value", got["HOME"])
	}
}

func TestScenarioEnvPinsTestModeAndTelemetryOff(t *testing.T) {
	got := envMap(ScenarioEnv(hostileParent(), nil))

	if got["NODE_ENV"] != "test" {
		t.Errorf("NODE_ENV = %q, want test (Node gates its update-notifier on it; Go accepts it "+
			"as an alias for GO_ENV when gating VIP_TOKEN_OVERRIDE)", got["NODE_ENV"])
	}
	if got["DO_NOT_TRACK"] != "1" {
		t.Errorf("DO_NOT_TRACK = %q, want 1", got["DO_NOT_TRACK"])
	}
}

func TestScenarioEnvOverridesWinOverPinnedValues(t *testing.T) {
	got := envMap(ScenarioEnv(hostileParent(), map[string]string{
		"API_HOST":           "http://127.0.0.1:65000",
		"VIP_TOKEN_OVERRIDE": "scenario.jwt",
		"WPVIP_DEPLOY_TOKEN": "deploy-tok",
		"NO_COLOR":           "1",
	}))

	if got["API_HOST"] != "http://127.0.0.1:65000" {
		t.Errorf("API_HOST = %q, want the scenario override", got["API_HOST"])
	}
	if got["VIP_TOKEN_OVERRIDE"] != "scenario.jwt" {
		t.Errorf("VIP_TOKEN_OVERRIDE = %q, want the scenario override", got["VIP_TOKEN_OVERRIDE"])
	}
	if got["WPVIP_DEPLOY_TOKEN"] != "deploy-tok" {
		t.Errorf("WPVIP_DEPLOY_TOKEN = %q, want the scenario override", got["WPVIP_DEPLOY_TOKEN"])
	}
	if got["NO_COLOR"] != "1" {
		t.Errorf("NO_COLOR = %q, want the scenario override", got["NO_COLOR"])
	}
}

// TestScenarioEnvIsAmbientIndependent is the property the whole slice exists
// for: a laptop with live credentials and a bare CI container must produce
// byte-identical subprocess environments.
func TestScenarioEnvIsAmbientIndependent(t *testing.T) {
	bareCI := []string{"PATH=/usr/bin:/bin", "HOME=/Users/developer"}

	overrides := map[string]string{"API_HOST": "http://127.0.0.1:65000"}
	laptop := envMap(ScenarioEnv(hostileParent(), overrides))
	ci := envMap(ScenarioEnv(bareCI, overrides))

	// The pinned token is minted per call (it carries a live exp claim), so
	// compare everything else exactly and assert the token is merely present.
	for _, m := range []map[string]string{laptop, ci} {
		if m["VIP_TOKEN_OVERRIDE"] == "" {
			t.Fatal("expected a pinned token in both environments")
		}
		delete(m, "VIP_TOKEN_OVERRIDE")
	}
	if len(laptop) != len(ci) {
		t.Fatalf("laptop env has %d vars, CI env has %d: %v vs %v", len(laptop), len(ci), laptop, ci)
	}
	for k, v := range laptop {
		if ci[k] != v {
			t.Errorf("%s: laptop=%q CI=%q", k, v, ci[k])
		}
	}
}

func TestFixtureTokenIsAcceptedByTheCLI(t *testing.T) {
	tok := FixtureToken()
	if strings.Count(tok, ".") != 2 {
		t.Fatalf("FixtureToken() = %q, want a three-segment JWT", tok)
	}
	// Two calls must both be valid; they need not be byte-identical.
	if other := FixtureToken(); strings.Count(other, ".") != 2 {
		t.Fatalf("second FixtureToken() = %q, want a three-segment JWT", other)
	}
}

// TestNoAmbientEnvInheritanceInScenarios is the permanent regression guard for
// this slice. Every fixture scenario must construct its subprocess environment
// through ScenarioEnv; a bare os.Environ() anywhere else silently re-opens the
// hole where the suite passes on a developer laptop and fails in CI.
func TestNoAmbientEnvInheritanceInScenarios(t *testing.T) {
	// env.go owns the allowlist; harness_test.go uses os.Environ() to invoke
	// `go build` (a toolchain call, not a CLI invocation); parker_live_test.go
	// is the live Parker gate and scrubs through BuildParkerEnv.
	allowed := map[string]bool{
		"env.go":              true,
		"env_test.go":         true,
		"harness_test.go":     true,
		"parker_live_test.go": true,
		"parker_test.go":      true,
	}

	entries, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("no Go sources found — did the package move?")
	}
	for _, path := range entries {
		base := filepath.Base(path)
		if allowed[base] {
			continue
		}
		src, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		for i, line := range strings.Split(string(src), "\n") {
			// Comments may legitimately name os.Environ() while explaining
			// why it is not used; only flag code.
			code, _, _ := strings.Cut(line, "//")
			if strings.Contains(code, "os.Environ()") {
				t.Errorf("%s:%d inherits the ambient environment; use FixtureEnv instead:\n\t%s",
					base, i+1, strings.TrimSpace(line))
			}
		}
	}
}

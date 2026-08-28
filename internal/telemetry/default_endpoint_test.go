package telemetry

import (
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/version"
)

// pendoEndpointOf digs the Pendo client out of a constructed Tracker.
func pendoEndpointOf(t *testing.T, tr *Tracker) string {
	t.Helper()
	if tr == nil {
		t.Fatal("NewDefault returned nil")
	}
	for _, c := range tr.Clients {
		if p, ok := c.(*PendoClient); ok {
			return p.Endpoint
		}
	}
	t.Fatal("no PendoClient in the default tracker")
	return ""
}

// TestPendoEndpointFollowsAPIHost is a privacy fix, not a cosmetic one.
//
// Node reaches Pendo through src/lib/api/http.ts, which prefixes
// `API_HOST` (src/lib/api.ts:21 — `process.env.API_HOST || PRODUCTION_API_HOST`).
// Point Node at staging and its analytics go to staging.
//
// Go hardcoded https://api.wpvip.com/pendo, so a developer or a CI job running
// against a local or staging API — the exact situation where you generate
// large volumes of junk events, and where the commands under test may be
// exercising a customer's data — still emitted every one of them to the
// PRODUCTION analytics pipeline. NewDefault already reads API_HOST for the
// keychain on the line above, which is what made the divergence easy to miss.
func TestPendoEndpointFollowsAPIHost(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("API_HOST", "https://api.staging.wpvip.com")

	got := pendoEndpointOf(t, NewDefault())

	if strings.Contains(got, "api.wpvip.com") && !strings.Contains(got, "staging") {
		t.Errorf("Pendo endpoint = %q; a staging run still ships telemetry to production", got)
	}
	if got != "https://api.staging.wpvip.com/pendo" {
		t.Errorf("Pendo endpoint = %q, want https://api.staging.wpvip.com/pendo", got)
	}
}

// TestPendoEndpointDefaultsToProduction keeps the ordinary case unchanged.
func TestPendoEndpointDefaultsToProduction(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("API_HOST", "")

	if got := pendoEndpointOf(t, NewDefault()); got != PendoEndpoint {
		t.Errorf("Pendo endpoint = %q, want %q", got, PendoEndpoint)
	}
}

// TestPendoEndpointTolersatesATrailingSlash — API_HOST is user-supplied, and
// "https://api.wpvip.com/" would otherwise produce "…com//pendo".
func TestPendoEndpointTolersatesATrailingSlash(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("API_HOST", "https://api.staging.wpvip.com/")

	if got := pendoEndpointOf(t, NewDefault()); got != "https://api.staging.wpvip.com/pendo" {
		t.Errorf("Pendo endpoint = %q, want https://api.staging.wpvip.com/pendo", got)
	}
}

// The user agent was hardcoded to the literal "vip-next/dev", so every release
// build reported itself as a dev build to Tracks and Pendo — tagging a release
// would silently not change it. It must follow the ldflags-injected version.
func TestDefaultTrackerUserAgentFollowsBuildVersion(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("API_HOST", "https://api.staging.wpvip.com")

	prev := version.Version
	t.Cleanup(func() { version.Version = prev })
	version.Version = "5.0.0-beta"

	tr := NewDefault()
	want := "vip-next/5.0.0-beta"

	var seen []string
	for _, c := range tr.Clients {
		switch client := c.(type) {
		case *TracksClient:
			seen = append(seen, client.UserAgent)
		case *PendoClient:
			seen = append(seen, client.UserAgent)
		}
	}
	if len(seen) == 0 {
		t.Fatal("no clients with a UserAgent; the assertion would be vacuous")
	}
	for _, got := range seen {
		if got != want {
			t.Errorf("UserAgent = %q, want %q", got, want)
		}
	}
}

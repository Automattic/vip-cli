package telemetry

import (
	"testing"

	"github.com/Automattic/vip/internal/version"
)

// The user agent was hardcoded to the literal "vip-next/dev", so every release
// build reported itself as a dev build to Tracks — tagging a release would
// silently not change it. It must follow the ldflags-injected version.
func TestDefaultTrackerUserAgentFollowsBuildVersion(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("API_HOST", "https://api.staging.wpvip.com")

	prev := version.Version
	t.Cleanup(func() { version.Version = prev })
	version.Version = "5.0.0-beta"

	tracks, ok := NewDefault().Client.(*TracksClient)
	if !ok {
		t.Fatal("default tracker has no TracksClient")
	}
	if want := "vip-next/5.0.0-beta"; tracks.UserAgent != want {
		t.Errorf("UserAgent = %q, want %q", tracks.UserAgent, want)
	}
}

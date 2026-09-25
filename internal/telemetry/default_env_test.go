package telemetry

import "testing"

func TestNewDefaultUsesProcessLocalIdentityForEnvironmentPAT(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("VIP_CLI_TOKEN", "environment-pat")
	tracker := NewDefault()
	if tracker == nil || tracker.UUIDStore != nil {
		t.Fatalf("environment PAT tracker must not have a keychain UUID store: %+v", tracker)
	}
	tracks, ok := tracker.Clients[0].(*TracksClient)
	if !ok {
		t.Fatalf("first telemetry client = %T, want TracksClient", tracker.Clients[0])
	}
	first := tracks.GetUserID()
	if first == "" || tracks.GetUserID() != first {
		t.Fatal("environment PAT analytics identity must be non-empty and stable in this process")
	}
}

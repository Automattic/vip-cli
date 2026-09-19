package rechallenge

import (
	"testing"
	"time"

	json "encoding/json/v2"
)

func TestSessionDecode(t *testing.T) {
	in := `{"challengeId":"abc","status":"pending","verificationUrl":"https://parker.example/verify/abc","pollIntervalSeconds":2,"expiresAt":"2026-06-05T12:00:00Z"}`
	var s Session
	if err := json.Unmarshal([]byte(in), &s); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if s.ChallengeID != "abc" {
		t.Errorf("ChallengeID = %q, want abc", s.ChallengeID)
	}
	if s.Status != StatusPending {
		t.Errorf("Status = %q, want pending", s.Status)
	}
	if s.PollIntervalSeconds != 2 {
		t.Errorf("PollIntervalSeconds = %d, want 2", s.PollIntervalSeconds)
	}
	if want := time.Date(2026, 6, 5, 12, 0, 0, 0, time.UTC); !s.ExpiresAt.Equal(want) {
		t.Errorf("ExpiresAt = %v, want %v", s.ExpiresAt, want)
	}
}

func TestExtensionDecode(t *testing.T) {
	in := `{"version":"v2","createSessionPath":"/p/v2/cli/sessions","statusPathTemplate":"/p/v2/cli/sessions/{challengeId}","exchangePathTemplate":"/p/v2/cli/sessions/{challengeId}/elevated-token","elevatedHeaderName":"x-elevated-token"}`
	var e Extension
	if err := json.Unmarshal([]byte(in), &e); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if e.Version != Version {
		t.Errorf("Version = %q, want %q", e.Version, Version)
	}
	if e.ElevatedHeaderName != "x-elevated-token" {
		t.Errorf("ElevatedHeaderName = %q", e.ElevatedHeaderName)
	}
}

func TestElevatedTokenDecode(t *testing.T) {
	in := `{"token":"opaque","expiresAt":"2026-06-05T13:00:00Z","purpose":"updateDefensiveModeStatus","headerName":"x-elevated-token"}`
	var tok ElevatedToken
	if err := json.Unmarshal([]byte(in), &tok); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if tok.Token != "opaque" {
		t.Errorf("Token = %q", tok.Token)
	}
	if tok.Purpose != "updateDefensiveModeStatus" {
		t.Errorf("Purpose = %q", tok.Purpose)
	}
}

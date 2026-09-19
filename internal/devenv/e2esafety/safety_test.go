package e2esafety

import (
	"bytes"
	"strings"
	"testing"
)

func TestEnabledRequiresExactOptIn(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  bool
	}{{"", false}, {"0", false}, {"true", false}, {"1", true}} {
		got := Enabled(func(string) string { return tc.value })
		if got != tc.want {
			t.Errorf("Enabled(%q) = %v, want %v", tc.value, got, tc.want)
		}
	}
}

func TestSkipPrintsExplicitMessage(t *testing.T) {
	var out bytes.Buffer
	if !Skip(func(string) string { return "" }, &out) {
		t.Fatal("Skip must stop the package when opt-in is absent")
	}
	if !strings.Contains(out.String(), "VIP_DEVENV_E2E=1") {
		t.Fatalf("skip message = %q", out.String())
	}
}

func TestRequireCleanListsExistingResources(t *testing.T) {
	s := Snapshot{
		"proxy-container": "container-id",
		"managed-hosts":   "hosts-sha256",
	}
	err := s.RequireClean()
	if err == nil || !strings.Contains(err.Error(), "managed-hosts, proxy-container") {
		t.Fatalf("RequireClean error = %v", err)
	}
}

func TestRequireCleanAllowsEmptySnapshot(t *testing.T) {
	if err := (Snapshot{}).RequireClean(); err != nil {
		t.Fatalf("empty snapshot must be clean: %v", err)
	}
}

func TestCanRemoveRequiresExactCreatedIdentity(t *testing.T) {
	for _, tc := range []struct {
		created string
		current string
		want    bool
	}{{"", "x", false}, {"x", "", false}, {"x", "replacement", false}, {"x", "x", true}} {
		if got := CanRemove(tc.created, tc.current); got != tc.want {
			t.Errorf("CanRemove(%q, %q) = %v, want %v", tc.created, tc.current, got, tc.want)
		}
	}
}

func TestAllOwnedMatchRejectsReplacementAndMissingResources(t *testing.T) {
	owned := Snapshot{"container": "container-1", "network": "network-1"}
	if !AllOwnedMatch(owned, Snapshot{"container": "container-1", "network": "network-1"}) {
		t.Fatal("exact identities must match")
	}
	if AllOwnedMatch(owned, Snapshot{"container": "container-2", "network": "network-1"}) {
		t.Fatal("replacement container must not match")
	}
	if AllOwnedMatch(owned, Snapshot{"container": "container-1"}) {
		t.Fatal("missing owned network must not match")
	}
}

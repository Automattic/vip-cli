package lifecycle

import (
	"testing"
	"time"
)

func TestShouldPull(t *testing.T) {
	now := time.Unix(1_000_000_000, 0)
	weekAgo := now.Add(-8 * 24 * time.Hour).Unix()
	yesterday := now.Add(-24 * time.Hour).Unix()

	// never pulled + registry reachable -> pull
	if !ShouldPull(now, nil, true) {
		t.Fatal("never-pulled+reachable should pull")
	}
	// pulled >7d ago + reachable -> pull
	if !ShouldPull(now, &weekAgo, true) {
		t.Fatal("stale + reachable should pull")
	}
	// pulled <7d ago -> skip
	if ShouldPull(now, &yesterday, true) {
		t.Fatal("fresh should not pull")
	}
	// registry unreachable -> skip even if stale
	if ShouldPull(now, &weekAgo, false) {
		t.Fatal("unreachable should not pull")
	}
}

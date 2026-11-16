package lifecycle

import (
	"testing"
	"time"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

func TestEnvironmentVersionRefresh(t *testing.T) {
	for _, tc := range []struct {
		version string
		upgrade bool
	}{
		{"", true},
		{"2.3.5", true},
		{EnvironmentVersion, false},
		{"2.3.7", false},
	} {
		t.Run(tc.version, func(t *testing.T) {
			now := time.Now()
			recent := now.Unix()
			data := &instancedata.InstanceData{Version: tc.version, PullAfter: &recent}
			if got := PrepareVersionUpdate(data); got != tc.upgrade {
				t.Fatalf("PrepareVersionUpdate(%q) = %t, want %t", tc.version, got, tc.upgrade)
			}
			if got := ShouldPull(now, data.PullAfter, true); got != tc.upgrade {
				t.Fatalf("ShouldPull after version check = %t, want %t", got, tc.upgrade)
			}
			if ShouldPull(now, data.PullAfter, false) {
				t.Fatal("version upgrades must retain the registry availability gate")
			}
		})
	}
}

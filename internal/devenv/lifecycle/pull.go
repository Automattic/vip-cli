package lifecycle

import "time"

// pullInterval is Lando's pullAfter window: re-pull images at most weekly.
const pullInterval = 7 * 24 * time.Hour

// ShouldPull reports whether `compose pull` should run before `up`. lastPull is
// the Unix time of the last pull (nil = never). It pulls when the registry is
// reachable AND (never pulled OR last pull is older than pullInterval).
func ShouldPull(now time.Time, lastPull *int64, registryReachable bool) bool {
	if !registryReachable {
		return false
	}
	if lastPull == nil {
		return true
	}
	return now.Sub(time.Unix(*lastPull, 0)) >= pullInterval
}

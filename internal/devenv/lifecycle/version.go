package lifecycle

import (
	"golang.org/x/mod/semver"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

// EnvironmentVersion must match Node's DEV_ENVIRONMENT_VERSION. Bump it when
// existing environments need fresh images and initialization services.
const EnvironmentVersion = "2.3.6"

// PrepareVersionUpdate bypasses the normal image pull delay for older
// environments, while preserving environments created by a newer CLI.
func PrepareVersionUpdate(data *instancedata.InstanceData) bool {
	if data.Version != "" && semver.Compare("v"+data.Version, "v"+EnvironmentVersion) >= 0 {
		return false
	}
	data.PullAfter = nil
	return true
}

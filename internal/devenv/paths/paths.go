// Package paths is the single source of truth for vip dev-env on-disk
// locations. Mirrors the Node helpers: xdg-data.ts (xdgData) and
// dev-environment-core.ts (getEnvironmentPath / getAllEnvironmentNames
// base dir). Command logs live per-environment, in a logs/ subdirectory of
// the environment's own instance directory, with one timestamped file per
// invocation (mirroring Node's getDevEnvLogFile).
package paths

import (
	"os"
	"path/filepath"
)

// XDGData mirrors Node's xdgData(): $XDG_DATA_HOME or ~/.local/share.
func XDGData() string {
	if d := os.Getenv("XDG_DATA_HOME"); d != "" {
		return d
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return filepath.Join(home, ".local", "share")
}

// DevEnvBase is the directory containing one subdirectory per environment.
// It uses the historical "dev-environment" segment (where existing env data
// already lives).
func DevEnvBase() string {
	return filepath.Join(XDGData(), "vip", "dev-environment")
}

// EnvironmentPath is the directory holding a single environment's state.
func EnvironmentPath(slug string) string {
	return filepath.Join(DevEnvBase(), slug)
}

// EnvLogDir is where an environment's per-invocation command logs live: a
// logs/ subdirectory inside the environment's own instance directory.
func EnvLogDir(slug string) string {
	return filepath.Join(EnvironmentPath(slug), "logs")
}

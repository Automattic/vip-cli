// Package dockercli drives the docker and docker compose CLIs (spec §4).
// "Purely Go" here means no Node/Lando — we still shell out to the docker
// binaries, which are already hard host requirements.
package dockercli

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// DockerSocket ports getDockerSocket (docker-utils.ts:45-82). On non-Windows
// it resolves a usable unix socket path, honoring a non-unix DOCKER_HOST
// verbatim. Returns "" (no error) when nothing usable is found.
//
// SIDE EFFECT (intentional, mirrors the Node helper): when a usable unix
// socket is discovered it also sets DOCKER_HOST=unix://<path> in the process
// environment so child `docker` invocations inherit it. Call once at startup.
func DockerSocket() (string, error) {
	if runtime.GOOS == "windows" {
		return "", nil
	}

	possible := os.Getenv("DOCKER_HOST")
	if possible != "" && !strings.HasPrefix(possible, "unix://") {
		return possible, nil
	}

	var candidates []string
	if possible != "" {
		// Strip leading unix:// (may have 1-3 slashes) and normalize to /path.
		trimmed := strings.TrimLeft(strings.TrimPrefix(possible, "unix:"), "/")
		candidates = append(candidates, "/"+trimmed)
	}
	home, _ := os.UserHomeDir()
	candidates = append(candidates,
		"/var/run/docker.sock",
		"/run/docker.sock",
		filepath.Join(home, ".docker", "run", "docker.sock"),
		filepath.Join(home, ".colima", "default", "docker.sock"),
		filepath.Join(home, ".orbstack", "run", "docker.sock"),
	)

	for _, p := range candidates {
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		if info.Mode()&os.ModeSocket != 0 {
			os.Setenv("DOCKER_HOST", "unix://"+p)
			return p, nil
		}
	}
	return "", nil
}

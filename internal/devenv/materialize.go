// Package devenv is the public API the cobra commands call: it materializes an
// environment's compose files, wires the real lifecycle dependencies, and owns
// create + the Start/Stop/Rebuild/Destroy/Purge/Info/Health entry points.
package devenv

import (
	"os"
	"path/filepath"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/paths"
)

// Materialize renders and writes docker-compose.yml, .env, and nginx/extra.conf
// into the env directory, returning that directory. Idempotent (overwrites).
func Materialize(slug string, v compose.View) (string, error) {
	dir := paths.EnvironmentPath(slug)
	if err := os.MkdirAll(filepath.Join(dir, "nginx"), 0o755); err != nil {
		return "", err
	}
	yml, err := compose.RenderCompose(v)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(dir, "docker-compose.yml"), yml, 0o644); err != nil {
		return "", err
	}
	// .env is shared with the Node CLI, which stores the user's dev-env
	// variables in it. Merge our managed LANDO_HOST_* keys into whatever is
	// already there instead of overwriting the file (parity blocker B3) — this
	// runs on create, start, rebuild, update and every envvar mutation, so an
	// overwrite here silently deleted variables set with the other CLI.
	existing, err := readEnvFileRaw(dir)
	if err != nil {
		return "", err
	}
	if err := writeEnvFileAtomic(filepath.Join(dir, ".env"), mergeEnvFile(existing, compose.RenderEnvFile(v))); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(dir, "nginx", "extra.conf"), []byte(compose.RenderNginxConf(v)), 0o644); err != nil {
		return "", err
	}
	return dir, nil
}

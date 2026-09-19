//go:build devenv_e2e

// Package commands devenv_e2e harness — the manual gate for the dev-env command
// cutover. Run with: go test -tags devenv_e2e -run TestDevEnvE2E ./cmd/vip-next/commands/ -v
//
// These exercise the real Docker/PTY/platform paths and need: a running Docker,
// a TTY (for exec/shell), and (for sync) `vip login`. They are skipped unless
// VIP_DEVENV_E2E=1 is set, so an accidental tagged run does not hang.
package commands

import "testing"

// TestDevEnvE2ELifecycle documents the create→start→exec→logs→stop→destroy path.
func TestDevEnvE2ELifecycle(t *testing.T) {
	t.Skip("MANUAL ONLY: create --slug e2e --start; exec -- wp option get home; logs; stop; destroy --yes")
}

// TestDevEnvE2EImport documents import sql/media into a running env.
func TestDevEnvE2EImport(t *testing.T) {
	t.Skip("MANUAL ONLY: import sql <dump> with --search-replace; import media <dir>; verify in container")
}

// TestDevEnvE2EEnvVar documents envvar set → rebuild → verify-in-container.
func TestDevEnvE2EEnvVar(t *testing.T) {
	t.Skip("MANUAL ONLY: envvar set MY_VAR hi; vip dev-env start; exec -- sh -c 'echo $MY_VAR'")
}

// TestDevEnvE2ESync documents the optional real-platform smoke test. Automated
// multisite coverage uses fixture SQL/SDS in internal/devenv and never sends a
// sync/export payload to the real API. This manual check still needs explicit
// human authorization, login, and a deliberately selected app/environment.
func TestDevEnvE2ESync(t *testing.T) {
	t.Skip("MANUAL ONLY WITH EXPLICIT AUTHORIZATION: vip login; vip @app.env dev-env sync sql --slug e2e; verify prod URLs rewritten locally")
}

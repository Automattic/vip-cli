package devenv

import "github.com/Automattic/vip/internal/devenv/compose"

// adoptSetupSteps prepends a one-time recursive chown when a start is adopting a
// pre-existing Lando environment. The reused NoCopy volumes (mu-plugins, and the
// image-mode client-code content) keep Lando's file ownership, so setup.sh — run
// as www-data — cannot overwrite pre-existing root-owned files like
// dev-env-plugin.php in the mu-plugins volume (the base chown is non-recursive:
// it fixes the mount-point dirs, not their contents). Normalizing /wp/wp-content
// to www-data once, as root, before setup.sh runs, fixes it. Greenfield starts
// pass adopting=false, so this never adds per-start cost.
func adoptSetupSteps(base []compose.SetupStep, adopting bool) []compose.SetupStep {
	if !adopting {
		return base
	}
	return append([]compose.SetupStep{
		{AsRoot: true, Command: "chown -R www-data:www-data /wp/wp-content"},
	}, base...)
}

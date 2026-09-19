package commands

import (
	"errors"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/nodeflags"
)

// ResolveSlug determines which EXISTING environment a command targets, matching
// the Node getEnvironmentName resolution order (dev-environment-cli.ts:146-192):
//  1. --slug, if set (lowercased by Node's processSlug —
//     dev-environment-cli.ts:979 — which every dev-env bin registers as the
//     option's parse function).
//  2. An @app.env alias: REJECTED with Node's message. allowAppEnv is set by
//     `dev-env create` alone (vip-dev-env-create.js:95); every other dev-env
//     command refuses it rather than guessing a local environment — this is a
//     guard on destructive commands, so it must fire before anything else.
//  3. The slug from a discovered .wpvip/vip-dev-env.yml, announced with Node's
//     "Using environment X from Y" line.
//  4. The sole environment, when exactly one exists.
//  5. Interactive: prompt to select from the existing environments.
//  6. Otherwise: a clear "specify --slug" error (wrapping ErrNonInteractive).
//
// Steps 5 and 6 are vip-next's replacement for Node's "More than one
// environment found" error / DEFAULT_SLUG fallback.
func ResolveSlug(cmd *cobra.Command) (string, error) {
	if s, _ := cmd.Flags().GetString("slug"); s != "" {
		return nodeflags.ProcessSlug(s), nil
	}
	if err := rejectAppEnvAlias(cmd); err != nil {
		return "", err
	}
	return ResolveLocalSlug(cmd)
}

// ResolveLocalSlug is ResolveSlug without the @app.env guard, for the one
// dev-env leaf where an alias is meaningful: `dev-env sync sql` uses @app.env
// to name the PLATFORM environment it exports from, and resolves the LOCAL
// target separately. Node models this by destructuring app/env out of the
// options before calling getEnvironmentName (vip-dev-env-sync-sql.js:98).
func ResolveLocalSlug(cmd *cobra.Command) (string, error) {
	if s, _ := cmd.Flags().GetString("slug"); s != "" {
		return nodeflags.ProcessSlug(s), nil
	}
	slug, err := configFileSlug(cmd)
	if err != nil || slug != "" {
		return slug, err
	}
	names := instancedata.AllNames()
	switch len(names) {
	case 0:
		return "", errors.New("no dev environments found; create one with `vip dev-env create`")
	case 1:
		return names[0], nil
	}
	if appctx.IsInteractive(cmd) {
		return appctx.Select(cmd, "Which environment?", names)
	}
	return "", fmt.Errorf("multiple environments found; specify --slug: %w", appctx.ErrNonInteractive)
}

// rejectAppEnvAlias ports getEnvironmentName's @app.env guard. `--app`/`--env`
// are root persistent flags that the alias PersistentPreRunE fills in from an
// `@app.env` token, so this covers both spellings — as it does in Node, where
// command.js:570 populates options.app from the parsed alias.
func rejectAppEnvAlias(cmd *cobra.Command) error {
	app, _ := cmd.Flags().GetString("app")
	if app == "" {
		return nil
	}
	name := app
	if env, _ := cmd.Flags().GetString("env"); env != "" {
		name += "-" + env
	}
	return fmt.Errorf("This command does not support @app.env notation. Use '--slug=%s' to target the local environment.", name)
}

// configFileSlug returns the slug from a discovered dev-env configuration file
// (walking up from the working directory), or "" when there is none. A file
// that exists but cannot be parsed is a hard error: Node exits there, and
// falling through would let `destroy` target a DIFFERENT environment than the
// repo is configured for.
//
// Node's slug is used verbatim here — unlike --slug it is not passed through
// processSlug, so it is not lowercased.
func configFileSlug(cmd *cobra.Command) (string, error) {
	cfg, err := devenv.LoadConfigFile()
	if err != nil {
		return "", err
	}
	if cfg == nil || cfg.Slug == "" {
		return "", nil
	}
	// Node suppresses the announcement only where the caller passes its
	// `quiet` option — `dev-env import sql --quiet` (vip-dev-env-import-sql.js:65).
	if quiet, _ := cmd.Flags().GetBool("quiet"); !quiet {
		fmt.Fprintf(cmd.OutOrStdout(), "Using environment %s from %s\n\n", cfg.Slug, cfg.Path)
	}
	return cfg.Slug, nil
}

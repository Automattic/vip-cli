package commands

import (
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
)

// NewDefensiveModeCmd returns the `defensive-mode` parent with all three
// subcommands attached. M4: root's --app/--env flags (alias-aware) replace
// the M3 numeric ID placeholders; WithAppContext + WithEnvContext middleware
// resolve them into the cmd.Context() AppEnv via GraphQL.
func NewDefensiveModeCmd() *cobra.Command {
	parent := &cobra.Command{
		Use:   "defensive-mode",
		Short: "Manage WAF defensive mode for an environment.",
		Long:  "Enable, disable, or configure WAF defensive mode for an environment. Mutations on production require step-up authentication.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}
	// --non-interactive lives at root (cmd/vip-next/root.go) so the
	// rechallenge middleware in main.go can resolve interactivity from a
	// single source. --skip-confirmation is command-tree-local to defensive-
	// mode because no other command has a production-confirm gate.
	parent.PersistentFlags().Bool("skip-confirmation", false, "Skip the production confirmation prompt.")
	// --rechallenge-wait is registered here, on the only command tree that
	// deliberately trips step-up, matching where Node registers it
	// (src/bin/vip-defensive-mode-{enable,disable,configure}.js). The flag is
	// read off the raw command line by rechallenge.ShouldWaitForRechallenge
	// rather than through cobra: the step-up middleware is constructed once at
	// startup and has no access to a command's parsed options. Registering it
	// is still required — otherwise cobra rejects it as an unknown flag before
	// the middleware ever runs. VIP_RECHALLENGE_WAIT=1 does the same thing
	// everywhere, and is what the fail-fast error points people at.
	parent.PersistentFlags().Bool("rechallenge-wait", false,
		"When step-up verification is required non-interactively, print the URL and wait for verification on another device instead of failing fast.")

	parent.AddCommand(newDefensiveModeEnableCmd())
	parent.AddCommand(newDefensiveModeDisableCmd())
	parent.AddCommand(newDefensiveModeConfigureCmd())
	return parent
}

// addAppEnvFlags registers command-LOCAL --app/--env flags carrying the -a/-e
// shorthands Node derives for every command with appContext/envContext
// (src/lib/cli/command.js:1075-1084 feeding createOptionDefinition).
//
// vip-next keeps --app/--env as root persistent flags so the @app.env alias
// has one place to land. They cannot carry the shorthands there: dev-env
// leaves legitimately use -a for --all/--app-code and -e for
// --elasticsearch/--editor/--extended, and pflag panics when a persistent
// shorthand collides with a local one. A same-named local flag is the
// per-command registration Node actually has — cobra's mergePersistentFlags
// skips a parent flag whose name is already present locally, and every reader
// (root's PersistentPreRunE, appctx's app/env resolvers) goes through
// cmd.Flag/cmd.Flags, so the local flag is the one that is read.
func addAppEnvFlags(c *cobra.Command) {
	if c.Flags().Lookup("app") == nil {
		c.Flags().StringP("app", "a", "",
			"Target an application. Accepts a string value for the application name or an integer for the application ID.")
	}
	if c.Flags().Lookup("env") == nil {
		c.Flags().StringP("env", "e", "",
			"Target an environment. Accepts a string value for the environment type.")
	}
}

// buildAppEnvCmd wires the standard WithAppContext + WithEnvContext middleware
// chain onto a leaf command. Shared by enable / disable / configure so the
// handlers can read a fully resolved AppEnv from cmd.Context().
func buildAppEnvCmd(c *cobra.Command, handler appctx.RunFunc) *cobra.Command {
	addAppEnvFlags(c)
	cfg := GetConfig()
	return appctx.Build(c,
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRun(handler)
}

// buildAppEnvRenderableCmd is buildAppEnvCmd's parallel for handlers that
// return (any, error) — i.e. handlers behind WithFormat. The WithFormat
// middleware is applied here against the handler before passing to
// WithRenderableRun.
func buildAppEnvRenderableCmd(c *cobra.Command, defaultFormat string, allowed []string, handler appctx.RenderableRunFunc) *cobra.Command {
	addAppEnvFlags(c)
	cfg := GetConfig()
	return appctx.Build(c,
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRenderableRun(
		appctx.WithFormat(c, defaultFormat, allowed...)(handler),
	)
}

// trackEvent is a nil-safe wrapper over cfg.Tracker.TrackEvent. Tracker is
// non-nil in production (telemetry.NewDefault always returns a value), but
// some tests construct a Config without a Tracker and we don't want them to
// panic.
func trackEvent(name string, props map[string]any) {
	cfg := GetConfig()
	if cfg.Tracker == nil {
		return
	}
	cfg.Tracker.TrackEvent(name, props)
}

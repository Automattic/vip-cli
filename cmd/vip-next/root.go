package main

import (
	"errors"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/cmd/vip-next/commands"
	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/version"
)

type rootContext struct {
	aliasApp string
	aliasEnv string
}

func newRootCmd(rc *rootContext) *cobra.Command {
	root := &cobra.Command{
		Use:           "vip-next",
		Short:         "WordPress VIP command-line interface (Go edition)",
		Long:          "vip-next is the Go rewrite of the @automattic/vip CLI. See https://docs.wpvip.com/.",
		SilenceUsage:  true,
		SilenceErrors: true,
		Version:       version.String(),
		Run:           func(cmd *cobra.Command, args []string) { _ = cmd.Help() },
	}
	root.SetVersionTemplate(version.String() + "\n")

	// Node registers --debug as `-d, --debug [value]` (command.js:1108-1111)
	// and forwards the value to debugLib.enable, using '*' when the flag is
	// given without one (command.js:557-559). A cobra Bool rejected the
	// namespace form that vip-next's own help advertised.
	root.PersistentFlags().StringP("debug", "d", "", "Generate verbose output during command execution. Accepts a comma-separated list of debug namespaces to scope the output (--debug=ns1,ns2).")
	root.PersistentFlags().Lookup("debug").NoOptDefVal = "*"
	root.PersistentFlags().String("app", "", "target app slug (alternative: @app.env alias)")
	root.PersistentFlags().String("env", "", "target environment slug (alternative: @app.env alias)")
	// --non-interactive lives on root so every command (and the rechallenge
	// middleware, via main.go's closure) can consult appctx.IsInteractive
	// against a single, command-tree-wide flag.
	root.PersistentFlags().Bool("non-interactive", false, "disable prompts; fail fast if a required flag is missing")

	root.PersistentPreRunE = func(cmd *cobra.Command, args []string) error {
		flagApp, _ := cmd.Flags().GetString("app")
		flagEnv, _ := cmd.Flags().GetString("env")
		hasAlias := rc.aliasApp != "" || rc.aliasEnv != ""
		hasFlag := flagApp != "" || flagEnv != ""
		if hasAlias && hasFlag {
			return errors.New("cannot combine @app alias with --app/--env on the same invocation")
		}
		if rc.aliasApp != "" {
			_ = cmd.Flags().Set("app", rc.aliasApp)
		}
		if rc.aliasEnv != "" {
			_ = cmd.Flags().Set("env", rc.aliasEnv)
		}
		return nil
	}

	root.AddCommand(commands.LoginCmd())
	root.AddCommand(commands.LogoutCmd())
	root.AddCommand(commands.NewWhoamiCmd())
	root.AddCommand(commands.NewDefensiveModeCmd())
	root.AddCommand(commands.NewEdgeWorkersCmd())
	root.AddCommand(commands.LogsCmd())
	root.AddCommand(commands.SlowlogsCmd())

	appCmd := commands.AppCmd()
	appCmd.AddCommand(commands.AppListCmd())
	// `vip app deploy` (+ `validate`) — M7c Custom Deployment. Wired
	// before the wildcard so it snapshots `deploy` as a real subcommand.
	appDeployCmd := commands.AppDeployCmd()
	appDeployCmd.AddCommand(commands.AppDeployValidateCmd())
	appCmd.AddCommand(appDeployCmd)
	// `vip app <name>` (positional, no real subcommand) dispatches via the
	// wildcard fallback. Must be wired AFTER real subcommands are added so the
	// wildcard snapshots the (final) subcommand-name set.
	appctx.WithWildcardCommand(appCmd, commands.RunAppGet)
	root.AddCommand(appCmd)

	// `vip config envvar list/get/get-all` — read-only M5 commands. Parent
	// nodes are bare cobra.Commands; only the leaves wrap WithAppContext +
	// WithEnvContext (via buildAppEnvCmd / buildAppEnvRenderableCmd).
	configCmd := commands.ConfigCmd()
	envvarCmd := commands.ConfigEnvvarCmd()
	envvarCmd.AddCommand(commands.ConfigEnvvarListCmd())
	envvarCmd.AddCommand(commands.ConfigEnvvarGetCmd())
	envvarCmd.AddCommand(commands.ConfigEnvvarGetAllCmd())
	// M6 mutation leaves. Production prod-gate is inline (message interpolates
	// variable name + app name); --skip-confirmation lives on the leaf via
	// WithSkipConfirmationFlag.
	envvarCmd.AddCommand(commands.ConfigEnvvarSetCmd())
	envvarCmd.AddCommand(commands.ConfigEnvvarDeleteCmd())
	configCmd.AddCommand(envvarCmd)
	// `vip config software get` — M8 read command. `update` will be added in Task 7.
	configCmd.AddCommand(commands.ConfigSoftwareCmd())
	root.AddCommand(configCmd)

	// `vip db phpmyadmin` — M5 readonly. Parent `db` is a plain cobra.Command;
	// only the leaf wraps WithAppContext + WithEnvContext (via buildAppEnvCmd).
	dbCmd := commands.DBCmd()
	dbCmd.AddCommand(commands.DBPhpmyadminCmd())
	root.AddCommand(dbCmd)

	// `vip cache purge-url` — M6 mutation. No prompt (cache purge is benign),
	// so the leaf only needs the standard WithAppContext + WithEnvContext
	// middleware via buildAppEnvCmd.
	cacheCmd := commands.CacheCmd()
	cacheCmd.AddCommand(commands.CachePurgeURLCmd())
	root.AddCommand(cacheCmd)

	// `vip import validate-sql` — M6b local-only file scanner. No GraphQL
	// or appctx middleware; the leaf is a plain cobra command with
	// ExactArgs(1).
	importCmd := commands.ImportCmd()
	importCmd.AddCommand(commands.ImportValidateSQLCmd())
	// `vip import sql` (+ `status`) — M7a heavy command. `status` is a
	// SUBCOMMAND of `import sql` (Node: command(...).command('status')).
	importSQLCmd := commands.ImportSQLCmd()
	importSQLCmd.AddCommand(commands.ImportSQLStatusCmd())
	importCmd.AddCommand(importSQLCmd)
	// `vip import media` (+ `status`, `abort`) — M7b heavy commands.
	importMediaCmd := commands.ImportMediaCmd()
	importMediaCmd.AddCommand(commands.ImportMediaStatusCmd())
	importMediaCmd.AddCommand(commands.ImportMediaAbortCmd())
	importCmd.AddCommand(importMediaCmd)
	// `vip import validate-files` — M7b local validator (GraphQL only for
	// the mediaImportConfig metadata; no app/env context).
	importCmd.AddCommand(commands.ImportValidateFilesCmd())
	root.AddCommand(importCmd)

	// `vip backup db` / `vip export sql` — M7c heavy commands.
	backupCmd := commands.BackupCmd()
	backupCmd.AddCommand(commands.BackupDBCmd())
	root.AddCommand(backupCmd)
	exportCmd := commands.ExportCmd()
	exportCmd.AddCommand(commands.ExportSQLCmd())
	root.AddCommand(exportCmd)

	// `vip sync` — M6 mutation. WithChildEnvContext rejects production targets;
	// WithRequireConfirm prompts unconditionally before the mutation fires.
	// Handler polls SyncProgress to a terminal state.
	root.AddCommand(commands.SyncCmd())

	// `vip wp` — WP1 SSH strategy + subshell. DisableFlagParsing; main.go's
	// normalizeWPArgs handles the `--`/`--yes` reshaping.
	root.AddCommand(commands.WPCmd())

	// `vip search-replace <file>` — port of src/bin/vip-search-replace.js.
	// Streams a local file through go-search-replace; defaults to STDOUT.
	root.AddCommand(commands.SearchReplaceCmd())

	// `vip dev-env` — full command tree (23 commands) as Node-CLI redirect
	// stubs. dev-env (Docker/Lando local dev) is out of scope for vip-next;
	// stubs ensure --help and completion show the surface. On the auth-bypass
	// list so no login is required.
	root.AddCommand(commands.DevEnvCmd())

	applyVersionToSubcommands(root)

	return root
}

// applyVersionToSubcommands mirrors Node, which adds -v/--version to EVERY
// subcommand, not just the root (src/lib/cli/command.js:1103-1107 runs for
// every bin, and command.js:553-555 prints the version and exits 0). Cobra
// only synthesizes the flag for commands whose Version field is set, so the
// field is propagated across the tree after wiring; cobra's
// InitDefaultVersionFlag then applies the same "v unless already taken"
// reservation Node's createOptionDefinition does.
func applyVersionToSubcommands(root *cobra.Command) {
	tmpl := root.VersionTemplate()
	var walk func(c *cobra.Command)
	walk = func(c *cobra.Command) {
		for _, child := range c.Commands() {
			child.Version = root.Version
			child.SetVersionTemplate(tmpl)
			walk(child)
		}
	}
	walk(root)
}

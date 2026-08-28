package commands

import (
	"errors"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/siteimport"
	"github.com/Automattic/vip/internal/tui"
)

// ImportSQLStatusCmd returns `vip import sql status`.
//
// Node parity: src/bin/vip-import-sql-status.js (73 LOC). Re-enters the
// shared status poller with ReturnMissingJobImmediately=true so a quiet
// environment reports "No import job found" instead of polling forever.
func ImportSQLStatusCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Check the status of a SQL database import currently in progress",
		Long: "Check the status of the most recent SQL database import to an environment. " +
			"If the import is still in progress, the command will poll until the import is complete.",
		Args: cobra.NoArgs,
	}
	addAppEnvFlags(cmd)
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRun(runImportSQLStatus)
}

func runImportSQLStatus(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}

	if !siteimport.IsSupportedApp(ae.App.TypeId) {
		// Node tracks errorType (camelCase) here, unlike vip-import-sql.js's
		// error_type — kept bug-for-bug (vip-import-sql-status.js:53).
		trackEvent("import_sql_command_error", map[string]any{"errorType": "unsupported-app"})
		return errors.New("The type of application you specified does not currently support SQL imports.")
	}

	trackEvent("import_sql_check_status_command_execute", nil)

	pt := tui.NewProgressTracker(nil)
	pt.SetPrefix("\n=============================================================\nChecking the SQL import status for your environment...\n")

	renderer := startImportProgressRenderer(cmd, pt)
	defer renderer.stop(cmd, false)

	// Domain for the success suffix: Node's status appQuery exposes
	// primaryDomain too; reuse the import-sql env info query.
	cfg := GetConfig()
	domain := ""
	if info, err := fetchImportEnvInfo(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID); err == nil {
		domain = info.PrimaryDomainName
	}
	if domain == "" {
		domain = "N/A" // status.ts:229 `env.primaryDomain?.name ?? 'N/A'`
	}

	return importSQLCheckStatus(cmd, pt, renderer, ae, domain, true)
}

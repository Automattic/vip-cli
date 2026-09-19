package commands

import (
	"errors"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/mediaimport"
)

// ImportMediaStatusCmd returns `vip import media status`.
//
// Node parity: src/bin/vip-import-media-status.js. saveErrorLog defaults
// to "prompt" here (js:55) — unlike the main import command where it
// defaults empty.
func ImportMediaStatusCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Check the status of a currently running media import",
		Long: "Check the status of a currently running media import or retrieve an error log of the " +
			"most recent media import. If the import is still in progress, the command will poll until " +
			"the import is complete.",
		Args: cobra.NoArgs,
	}
	cmd.Flags().Bool("exportFileErrorsToJson", false, "Format an error log in JSON. Default is TXT.")
	cmd.Flags().StringP("saveErrorLog", "s", "prompt", "Skip the confirmation prompt and download an error log automatically.")

	addAppEnvFlags(cmd)
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRun(runImportMediaStatus)
}

func runImportMediaStatus(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}

	if !mediaimport.IsSupportedApp(ae.App.Type) {
		trackEvent("import_media_command_error", map[string]any{"errorType": "unsupported-app"})
		// vip-import-media-status.js:64 wording.
		return errors.New("The type of application you specified does not currently support this feature.")
	}

	trackEvent("import_media_check_status_command_execute", nil)

	exportJSON, _ := cmd.Flags().GetBool("exportFileErrorsToJson")
	saveErrorLog, _ := cmd.Flags().GetString("saveErrorLog")

	tracker := mediaimport.NewTracker()
	tracker.SetPrefix("\n=============================================================\nChecking the Media import status for your environment...\n")

	return mediaImportCheckStatusCmd(cmd, tracker, ae, exportJSON, saveErrorLog)
}

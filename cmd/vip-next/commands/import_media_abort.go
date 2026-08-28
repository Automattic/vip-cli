package commands

import (
	"errors"
	"fmt"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/mediaimport"
)

// ImportMediaAbortCmd returns `vip import media abort`.
//
// Node parity: src/bin/vip-import-media-abort.js. requireConfirm gates
// the mutation; GraphQL errors print and exit 0 (js:103-108).
func ImportMediaAbortCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "abort",
		Short: "Abort the media import currently in progress",
		Long:  "Abort the media file import that is currently in progress on an environment. The import process cannot be resumed.",
		Args:  cobra.NoArgs,
	}
	addAppEnvFlags(cmd)
	addSkipConfirmationWithForceAlias(cmd)
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithSkipConfirmationFlag(cmd),
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
		appctx.WithRequireConfirm(cmd, importMediaAbortConfirmMessage()),
	).WithRun(runImportMediaAbort)
}

// importMediaAbortConfirmMessage — vip-import-media-abort.js:63.
func importMediaAbortConfirmMessage() string {
	bold := color.New(color.FgRed, color.Bold)
	return "\n" + bold.Sprint("Running this command will stop the currently running media import. The import process cannot be resumed.") +
		"\n" + bold.Sprint("Are you sure you want to abort this media import?") + "\n"
}

func runImportMediaAbort(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	out := cmd.OutOrStdout()

	if !mediaimport.IsSupportedApp(ae.App.Type) {
		trackEvent("import_media_command_error", map[string]any{"errorType": "unsupported-app"})
		// vip-import-media-abort.js:78 wording (differs from status's).
		return errors.New("The type of application you specified does not currently support media file imports.")
	}

	trackEvent("import_media_abort_execute", nil)

	tracker := mediaimport.NewTracker()
	tracker.SetPrefix("\n=============================================================\nAborting this media import.\n")

	input := &gql.AppEnvironmentAbortMediaImportInput{
		ApplicationId: ae.App.ID,
		EnvironmentId: ae.Env.ID,
	}
	if _, err := gql.AbortMediaImport(gql.WithAllowGQLErrors(cmd.Context()), cfg.GQLClient, input); err != nil {
		// js:103-108 — print and exit 0.
		fmt.Fprintln(out, color.RedString("Error:"), err.Error())
		trackEvent("import_media_abort_execute_error", map[string]any{"error": "Error: " + err.Error()})
		return nil
	}

	// Node calls mediaImportCheckStatus without error-log options (js:101).
	return mediaImportCheckStatusCmd(cmd, tracker, ae, false, "")
}

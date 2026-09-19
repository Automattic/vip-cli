package commands

import (
	"errors"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/defensivemode"
)

func newDefensiveModeDisableCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "disable",
		Short: "Disable defensive mode (step-up auth required).",
		Long:  "Disable WAF defensive mode for the target environment. Step-up auth is required on production.",
	}
	return buildAppEnvCmd(c, runDefensiveModeDisable)
}

func runDefensiveModeDisable(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	skipConfirm, _ := cmd.Flags().GetBool("skip-confirmation")

	if ae.Env.Type == "production" && !skipConfirm {
		if !appctx.IsInteractive(cmd) {
			trackEvent("defensive_mode_disable_command_cancelled", nil)
			return fmt.Errorf("refusing to disable defensive mode on production without --skip-confirmation in non-interactive mode")
		}
		ok, err := appctx.Confirm(cmd,
			fmt.Sprintf("Disable defensive mode on production for %s?", ae.App.Name), false)
		if err != nil || !ok {
			trackEvent("defensive_mode_disable_command_cancelled", nil)
			if err != nil {
				return err
			}
			fmt.Fprintln(cmd.ErrOrStderr(), "Command cancelled")
			return nil
		}
	}

	result, err := defensivemode.UpdateDefensiveModeStatus(cmd.Context(), cfg.GQLClient, defensivemode.UpdateStatusInput{
		AppID:   ae.App.ID,
		EnvID:   ae.Env.ID,
		Enabled: false,
	})
	if err != nil {
		return err
	}
	if !result.Success {
		trackEvent("defensive_mode_disable_command_error", map[string]any{"error": result.Message})
		return fmt.Errorf("failed to disable defensive mode: %s", result.Message)
	}
	trackEvent("defensive_mode_disable_command_success", nil)
	fmt.Fprintf(cmd.OutOrStdout(), "✓ Defensive mode disabled for %s.%s — %s\n", ae.App.Name, ae.Env.Type, result.Message)
	return nil
}

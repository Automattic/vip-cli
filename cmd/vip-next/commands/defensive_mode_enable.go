package commands

import (
	"errors"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/defensivemode"
)

func newDefensiveModeEnableCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "enable",
		Short: "Enable defensive mode (step-up auth required).",
		Long:  "Enable WAF defensive mode for the target environment. Step-up auth is required on production.",
	}
	return buildAppEnvCmd(c, runDefensiveModeEnable)
}

func runDefensiveModeEnable(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	skipConfirm, _ := cmd.Flags().GetBool("skip-confirmation")

	if ae.Env.Type == "production" && !skipConfirm {
		if !appctx.IsInteractive(cmd) {
			trackEvent("defensive_mode_enable_command_cancelled", nil)
			return fmt.Errorf("refusing to enable defensive mode on production without --skip-confirmation in non-interactive mode")
		}
		ok, err := appctx.Confirm(cmd,
			fmt.Sprintf("Enable defensive mode on production for %s?", ae.App.Name), false)
		if err != nil || !ok {
			trackEvent("defensive_mode_enable_command_cancelled", nil)
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
		Enabled: true,
	})
	if err != nil {
		return err
	}
	if !result.Success {
		trackEvent("defensive_mode_enable_command_error", map[string]any{"error": result.Message})
		return fmt.Errorf("failed to enable defensive mode: %s", result.Message)
	}
	trackEvent("defensive_mode_enable_command_success", nil)
	fmt.Fprintf(cmd.OutOrStdout(), "✓ Defensive mode enabled for %s.%s — %s\n", ae.App.Name, ae.Env.Type, result.Message)
	return nil
}

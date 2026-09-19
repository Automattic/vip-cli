package commands

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/defensivemode"
)

func newDefensiveModeConfigureCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "configure",
		Short: "Update the defensive mode configuration (step-up auth required).",
		Long:  "Update the defensive mode configuration for the target environment. Use --enabled and --challenge-type as required flags.",
	}
	c.Flags().String("enabled", "", "Whether defensive mode should be enabled (true|false). Required.")
	c.Flags().String("challenge-type", "", "Challenge type integer. Required.")
	c.Flags().String("connection-threshold-absolute", "", "Absolute connection threshold.")
	c.Flags().String("connection-threshold-percentage", "", "Connection threshold percentage.")
	return buildAppEnvCmd(c, runDefensiveModeConfigure)
}

func runDefensiveModeConfigure(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()

	skipConfirm, _ := cmd.Flags().GetBool("skip-confirmation")
	enabledRaw, _ := cmd.Flags().GetString("enabled")
	challengeTypeRaw, _ := cmd.Flags().GetString("challenge-type")
	absRaw, _ := cmd.Flags().GetString("connection-threshold-absolute")
	pctRaw, _ := cmd.Flags().GetString("connection-threshold-percentage")

	// Validate flag formats first.
	enabled, err := parseBoolean(enabledRaw)
	if enabledRaw != "" && err != nil {
		return fmt.Errorf("invalid value for --enabled: %s. Expected true or false", enabledRaw)
	}
	challengeType, err := parsePositiveInt(challengeTypeRaw)
	if challengeTypeRaw != "" && err != nil {
		return fmt.Errorf("invalid value for --challenge-type: %s. Expected a non-negative integer", challengeTypeRaw)
	}
	abs, err := parsePositiveIntPtr(absRaw)
	if absRaw != "" && err != nil {
		return fmt.Errorf("invalid value for --connection-threshold-absolute: %s", absRaw)
	}
	pct, err := parsePositiveIntPtr(pctRaw)
	if pctRaw != "" && err != nil {
		return fmt.Errorf("invalid value for --connection-threshold-percentage: %s", pctRaw)
	}

	// Missing-required prompt path (interactive only). The Confirm/Input
	// helpers themselves return ErrNonInteractive in non-interactive mode,
	// so we don't have to gate on IsInteractive here.
	if enabledRaw == "" {
		picked, perr := appctx.Confirm(cmd, "Enable defensive mode?", true)
		if perr != nil {
			return fmt.Errorf("--enabled is required: %w", perr)
		}
		enabled = picked
	}
	if challengeTypeRaw == "" {
		raw, perr := appctx.Input(cmd, "Challenge type (integer):", "")
		if perr != nil {
			return fmt.Errorf("--challenge-type is required: %w", perr)
		}
		n, ierr := strconv.Atoi(strings.TrimSpace(raw))
		if ierr != nil || n < 0 {
			return fmt.Errorf("invalid challenge type %q", raw)
		}
		challengeType = n
	}

	// Production guard.
	if ae.Env.Type == "production" && !skipConfirm {
		if !appctx.IsInteractive(cmd) {
			trackEvent("defensive_mode_configure_command_cancelled", nil)
			return fmt.Errorf("refusing to configure defensive mode on production without --skip-confirmation in non-interactive mode")
		}
		ok, perr := appctx.Confirm(cmd,
			fmt.Sprintf("Configure defensive mode on production for %s?", ae.App.Name), false)
		if perr != nil || !ok {
			trackEvent("defensive_mode_configure_command_cancelled", nil)
			if perr != nil {
				return perr
			}
			fmt.Fprintln(cmd.ErrOrStderr(), "Command cancelled")
			return nil
		}
	}

	input := defensivemode.UpdateConfigInput{
		AppID:                         ae.App.ID,
		EnvID:                         ae.Env.ID,
		Enabled:                       enabled,
		ChallengeType:                 challengeType,
		ConnectionThresholdAbsolute:   abs,
		ConnectionThresholdPercentage: pct,
	}
	result, err := defensivemode.UpdateDefensiveModeConfig(cmd.Context(), cfg.GQLClient, input)
	if err != nil {
		return err
	}
	if !result.Success {
		trackEvent("defensive_mode_configure_command_error", map[string]any{"error": result.Message})
		return fmt.Errorf("failed to update defensive mode config: %s", result.Message)
	}
	trackEvent("defensive_mode_configure_command_success", nil)
	fmt.Fprintf(cmd.OutOrStdout(), "✓ Defensive mode configuration updated for %s.%s — %s\n", ae.App.Name, ae.Env.Type, result.Message)
	return nil
}

func parseBoolean(raw string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "true", "yes", "1", "on", "enable", "enabled":
		return true, nil
	case "false", "no", "0", "off", "disable", "disabled":
		return false, nil
	}
	return false, fmt.Errorf("unparseable boolean: %q", raw)
}

func parsePositiveInt(raw string) (int, error) {
	if raw == "" {
		return 0, fmt.Errorf("empty")
	}
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n < 0 {
		return 0, fmt.Errorf("not a non-negative integer: %q", raw)
	}
	return n, nil
}

func parsePositiveIntPtr(raw string) (*int, error) {
	if raw == "" {
		return nil, nil
	}
	n, err := parsePositiveInt(raw)
	if err != nil {
		return nil, err
	}
	return &n, nil
}

package commands

import (
	"errors"
	"fmt"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/envvar"
	"github.com/Automattic/vip/internal/exit"
)

// ConfigEnvvarDeleteCmd returns `vip config envvar delete <VARIABLE_NAME>`.
//
// Mutation wrapper around deleteEnvironmentVariable. Interactive flow
// when --skip-confirmation is absent (Node parity, src/bin/vip-config-envvar-delete.js):
//
//  1. Production prod-gate: confirms against env name + app name (only on prod).
//  2. ValidateName: rejects malformed names with the Node-parity error text.
//  3. Text input: user must type the variable name exactly ("Type FOO to confirm deletion:").
//  4. Yes/no: "Are you sure? Deletion is permanent" (red+bold).
//  5. promptForReloadManifest: "Apply this environment variable update now?".
//
// All interactive gates short-circuit to no-op under --skip-confirmation OR
// VIP_NON_INTERACTIVE=1 (parity scenarios use one or the other). Decline at
// any gate prints a Node-parity cancel line to stdout + exits 0; the mutation
// does not fire.
func ConfigEnvvarDeleteCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "delete <VARIABLE_NAME>",
		Short: "Delete an environment variable",
		Long:  "Permanently delete an environment variable from the target environment.",
		Args:  cobra.ExactArgs(1),
	}

	addAppEnvFlags(cmd)
	// vip-config-envvar-delete.js registers --skip-confirmation itself, so it
	// takes the auto-derived -s.
	cmd.Flags().BoolP("skip-confirmation", "s", false, "Skip confirmation prompts.")
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithSkipConfirmationFlag(cmd),
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRun(runEnvvarDelete)
}

func runEnvvarDelete(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()

	// Node parity: vip-config-envvar-delete.js uppercases + trims args[0]
	// before any validation.
	name := strings.ToUpper(strings.TrimSpace(args[0]))

	trackEvent("envvar_delete_command_execute", map[string]any{"variable_name": name})

	// Production prod-gate (inline because the message interpolates name + app).
	skipConfirm, _ := cmd.Flags().GetBool("skip-confirmation")
	if !skipConfirm && ae.Env.Type == "production" {
		msg := fmt.Sprintf("Are you sure you want to delete the environment variable %s on %s for site %s?", name, formatEnvironment(ae.Env.Type), ae.App.Name)
		ok, err := appctx.Confirm(cmd, msg, false)
		if errors.Is(err, appctx.ErrNonInteractive) || (err == nil && !ok) {
			trackEvent("envvar_delete_command_cancelled", nil)
			fmt.Fprintln(cmd.OutOrStdout(), "Command cancelled")
			return nil
		}
		if err != nil {
			return err
		}
	}

	if err := envvar.ValidateName(name); err != nil {
		fmt.Fprintln(cmd.OutOrStdout(), color.RedString(err.Error()))
		trackEvent("envvar_delete_command_error", map[string]any{"error": "invalid_name"})
		return exit.Handled(err)
	}

	// Node parity (src/bin/vip-config-envvar-delete.js): double-confirm gate —
	// first ask the user to type the variable name, then ask a yes/no.
	// Both decline paths emit a yellow cancel message and return nil (exit 0).
	// Telemetry events split per cancel path.
	if !skipConfirm {
		typed, err := appctx.Input(cmd, fmt.Sprintf("Type %s to confirm deletion:", name), "")
		if errors.Is(err, appctx.ErrNonInteractive) || (err == nil && typed != name) {
			fmt.Fprintln(cmd.OutOrStdout(), color.YellowString("Command cancelled by user."))
			trackEvent("envvar_delete_user_cancelled_input", nil)
			return nil
		}
		if err != nil {
			return err
		}

		msg := fmt.Sprintf("Are you sure? %s", color.New(color.FgRed, color.Bold).Sprint("Deletion is permanent"))
		ok, err := appctx.Confirm(cmd, msg, false)
		if errors.Is(err, appctx.ErrNonInteractive) || (err == nil && !ok) {
			fmt.Fprintln(cmd.OutOrStdout(), color.YellowString("Command cancelled by user."))
			trackEvent("envvar_delete_user_cancelled_confirmation", nil)
			return nil
		}
		if err != nil {
			return err
		}
	}

	// Node parity (src/bin/vip-config-envvar-delete.js): ask whether to apply
	// the update now, then pass through to reloadManifest on the mutation
	// input. Short-circuits to false on --skip-confirmation / non-interactive.
	reloadManifest, _ := envvar.PromptForReloadManifest(cmd, ae.App.TypeId, skipConfirm)

	if err := envvar.Delete(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID, name, reloadManifest); err != nil {
		trackEvent("envvar_delete_command_error", map[string]any{"error": err.Error()})
		return err
	}

	trackEvent("envvar_delete_command_success", map[string]any{"variable_name": name})
	fmt.Fprintln(cmd.OutOrStdout(),
		color.GreenString(fmt.Sprintf(`Successfully deleted environment variable "%s"`, name)))

	// Node parity: delete's success path only emits showDeployWarning when
	// the user declined the reload AND was actually prompted (not skipConfirm).
	// Unlike set, delete has no "active and available" message.
	if !skipConfirm && !reloadManifest {
		envvar.ShowDeployWarning(cmd.OutOrStdout())
	}
	return nil
}

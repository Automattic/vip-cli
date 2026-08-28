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

// ConfigEnvvarSetCmd returns `vip config envvar set <VARIABLE_NAME>`.
//
// Mutation wrapper around addEnvironmentVariable (server-side upsert).
// Production confirms inline because the prompt message interpolates the
// variable name + app name dynamically.
//
// Deferred (interactive-only) behavior — see commit message:
//   - promptForReloadManifest after the mutation succeeds.
//   - Value-echo confirmation when --from-file is used.
//
// Both are bypassed when --skip-confirmation is set or VIP_NON_INTERACTIVE=1,
// which covers the parity scenarios in M6.
func ConfigEnvvarSetCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "set <VARIABLE_NAME>",
		Short: "Set the value of an environment variable",
		Long:  "Add or update an environment variable. The value can be passed via --from-file=<path> or entered at a masked prompt.",
		Args:  cobra.ExactArgs(1),
	}
	addAppEnvFlags(cmd)
	cmd.Flags().StringP("from-file", "f", "", "Read the value from a file (Node parity: data.trim() strips surrounding whitespace).")

	// vip-config-envvar-set.js registers --from-file then --skip-confirmation,
	// so they take -f and -s respectively.
	cmd.Flags().BoolP("skip-confirmation", "s", false, "Skip confirmation prompts.")
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithSkipConfirmationFlag(cmd),
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRun(runEnvvarSet)
}

func runEnvvarSet(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()

	// Node parity: vip-config-envvar-set.js uppercases + trims args[0] before
	// any validation or block check.
	name := strings.ToUpper(strings.TrimSpace(args[0]))

	trackEvent("envvar_set_command_execute", map[string]any{"variable_name": name})

	// Production prod-gate (inline because the message interpolates name + app).
	skipConfirm, _ := cmd.Flags().GetBool("skip-confirmation")
	if !skipConfirm && ae.Env.Type == "production" {
		msg := fmt.Sprintf("Are you sure you want to set the environment variable %s on %s for site %s?", name, formatEnvironment(ae.Env.Type), ae.App.Name)
		ok, err := appctx.Confirm(cmd, msg, false)
		if errors.Is(err, appctx.ErrNonInteractive) || (err == nil && !ok) {
			trackEvent("envvar_set_command_cancelled", nil)
			fmt.Fprintln(cmd.OutOrStdout(), "Command cancelled")
			return nil
		}
		if err != nil {
			return err
		}
	}

	// Validate name (Node parity: validateName, then NEW_RELIC block).
	if err := envvar.ValidateName(name); err != nil {
		fmt.Fprintln(cmd.OutOrStdout(), color.RedString(err.Error()))
		trackEvent("envvar_set_command_error", map[string]any{"error": "invalid_name"})
		return exit.Handled(err)
	}

	// NEW_RELIC_LICENSE_KEY is platform-managed — refuse.
	if name == envvar.NewRelicKey {
		const blockMsg = "Setting the New Relic key is not permitted. If you want to set your own New Relic key, please contact WordPress VIP support."
		fmt.Fprintln(cmd.OutOrStdout(), color.RedString(blockMsg))
		trackEvent("envvar_set_command_error", map[string]any{"error": "new_relic_blocked"})
		return exit.Handled(errors.New(blockMsg))
	}

	// Resolve value: --from-file wins; otherwise masked Secret prompt.
	fromFile, _ := cmd.Flags().GetString("from-file")
	var value string
	if fromFile != "" {
		v, err := envvar.ReadFromFile(fromFile)
		if err != nil {
			trackEvent("envvar_set_command_error", map[string]any{"error": "read_file"})
			return err
		}
		value = v
	} else {
		v, err := appctx.Secret(cmd, fmt.Sprintf("Enter the value for %s:", name))
		if errors.Is(err, appctx.ErrNonInteractive) {
			trackEvent("envvar_set_command_error", map[string]any{"error": "non_interactive_no_file"})
			return fmt.Errorf("--from-file=<path> is required in non-interactive contexts")
		}
		if err != nil {
			return err
		}
		value = v
	}

	// Value-echo confirm: ONLY on --from-file path, only when not --skip-confirmation.
	// Decline branch mirrors the prod-gate's three-branch shape: distinguish
	// ErrNonInteractive (silent cancel) and survey error (real failure) so a
	// closed-pipe survey crash doesn't masquerade as a user decline.
	if fromFile != "" && !skipConfirm {
		envvar.EchoValueForConfirm(cmd.OutOrStdout(), value)
		ok, err := appctx.Confirm(cmd, "Please confirm the input value above", false)
		if errors.Is(err, appctx.ErrNonInteractive) || (err == nil && !ok) {
			// Node parity: this code path uses "Command cancelled by user."
			// (yellow), unlike the prod-gate decline which uses plain
			// "Command cancelled". Both match Node — different code paths,
			// different wording per src/lib/envvar/input.ts::cancel().
			fmt.Fprintln(cmd.OutOrStdout(), color.YellowString("Command cancelled by user."))
			trackEvent("envvar_set_user_cancelled_confirmation", nil)
			return nil
		}
		if err != nil {
			return err
		}
	}

	// Node parity (src/bin/vip-config-envvar-set.js): ask whether to apply
	// the update now, then pass through to reloadManifest on the mutation
	// input. Short-circuits to false on --skip-confirmation / non-interactive.
	reloadManifest, _ := envvar.PromptForReloadManifest(cmd, ae.App.TypeId, skipConfirm)

	if err := envvar.Set(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID, name, value, reloadManifest); err != nil {
		trackEvent("envvar_set_command_error", map[string]any{"error": err.Error()})
		return err
	}

	trackEvent("envvar_set_command_success", map[string]any{"variable_name": name})
	fmt.Fprintln(cmd.OutOrStdout(),
		color.GreenString(fmt.Sprintf(`Successfully set environment variable "%s"`, name)))

	// Node parity post-success branching:
	//   reloadManifest=true  -> yellow "active and available"
	//   reloadManifest=false AND interactive (i.e. not --skip-confirmation)
	//     -> showDeployWarning() reminding the user it won't apply until deploy.
	if reloadManifest {
		fmt.Fprintln(cmd.OutOrStdout(),
			color.YellowString("Environment variable is active and available."))
	} else if !skipConfirm {
		envvar.ShowDeployWarning(cmd.OutOrStdout())
	}
	return nil
}

package commands

import (
	"errors"
	"fmt"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/envvar"
)

// ConfigEnvvarGetCmd returns `vip config envvar get <VARIABLE_NAME>`.
//
// Single-name fetch is implemented client-side (envvar.Get filters the
// get-all result) because the schema exposes no per-name query — see
// envvar/envvar.go. Node parity: src/bin/vip-config-envvar-get.js
// uppercases the argument and prints a yellow not-found stdout message
// + exit 0 when the variable is missing.
func ConfigEnvvarGetCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "get <VARIABLE_NAME>",
		Short: "Get the value of an environment variable",
		Long:  "Retrieve the value of a specific environment variable.",
	}
	wrapped := buildAppEnvCmd(cmd, runEnvvarGet)
	// Argv-count enforcement runs after the middleware chain so the error
	// message names the final command. Node parity: requiredArgs: 1.
	prev := wrapped.RunE
	wrapped.RunE = func(c *cobra.Command, args []string) error {
		if len(args) != 1 {
			return fmt.Errorf("Please supply 1 argument: %s <VARIABLE_NAME>", c.UseLine())
		}
		return prev(c, args)
	}
	return wrapped
}

func runEnvvarGet(cmd *cobra.Command, args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("Please supply 1 argument: %s <VARIABLE_NAME>", cmd.UseLine())
	}
	// Help the user by uppercasing input — Node parity.
	name := strings.ToUpper(strings.TrimSpace(args[0]))

	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()

	trackEvent("envvar_get_command_execute", map[string]any{"variable_name": name})
	v, err := envvar.Get(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID, name)
	if err != nil {
		trackEvent("envvar_get_query_error", map[string]any{"variable_name": name, "error": err.Error()})
		return err
	}
	trackEvent("envvar_get_command_success", map[string]any{"variable_name": name})

	if v == nil {
		// Node renders the name via JSON.stringify (quoted) — Go's %q matches.
		fmt.Fprintln(cmd.OutOrStdout(),
			color.YellowString(fmt.Sprintf("The environment variable %q does not exist", name)))
		return nil
	}
	fmt.Fprintln(cmd.OutOrStdout(), v.Value)
	return nil
}

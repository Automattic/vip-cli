package commands

import (
	"errors"
	"fmt"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/envvar"
	"github.com/Automattic/vip/internal/output"
)

// ConfigEnvvarGetAllCmd returns `vip config envvar get-all`. Wraps the
// GetEnvironmentVariablesWithValues genqlient query. Empty results print
// the Node-parity yellow stdout message + exit 0. Column order matches
// Node's formatData output: <key>, value.
func ConfigEnvvarGetAllCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "get-all",
		Short: "Retrieve all environment variables and their values",
		Long:  "Retrieve a list of all environment variables and their values.",
	}
	addFormatFlagWithShort(cmd)
	return buildAppEnvRenderableCmd(cmd, "table",
		[]string{"table", "csv", "json", "keyValue", "ids"}, runEnvvarGetAll)
}

func runEnvvarGetAll(cmd *cobra.Command, args []string) (any, error) {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return nil, errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	trackEvent("envvar_get_all_command_execute", nil)
	vars, err := envvar.GetAll(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID)
	if err != nil {
		trackEvent("envvar_get_all_query_error", map[string]any{"error": err.Error()})
		return nil, err
	}
	trackEvent("envvar_get_all_command_success", nil)
	if len(vars) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), color.YellowString("There are no environment variables"))
		return nil, nil
	}
	keyName := envvarKeyForFormat(cmd)
	rows := make(output.OrderedRows, 0, len(vars))
	for _, v := range vars {
		rows = append(rows, output.OrderedRow{
			{Key: keyName, Value: v.Name},
			{Key: "value", Value: v.Value},
		})
	}
	return rows, nil
}

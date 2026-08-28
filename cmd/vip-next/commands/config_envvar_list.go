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

// ConfigEnvvarListCmd returns `vip config envvar list`. Wraps the
// GetEnvironmentVariables genqlient query. Empty results print Node's
// "There are no environment variables" yellow message and exit 0; the
// key column varies by format (name | key | id) to match Node parity.
func ConfigEnvvarListCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "list",
		Short: "List the names of environment variables",
		Long:  "List the names of all environment variables on an environment.",
	}
	addFormatFlagWithShort(cmd)
	return buildAppEnvRenderableCmd(cmd, "table",
		[]string{"table", "csv", "json", "keyValue", "ids"}, runEnvvarList)
}

func runEnvvarList(cmd *cobra.Command, args []string) (any, error) {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return nil, errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	trackEvent("envvar_list_command_execute", nil)
	names, err := envvar.List(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID)
	if err != nil {
		trackEvent("envvar_list_query_error", map[string]any{"error": err.Error()})
		return nil, err
	}
	trackEvent("envvar_list_command_success", nil)
	if len(names) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), color.YellowString("There are no environment variables"))
		return nil, nil
	}
	keyName := envvarKeyForFormat(cmd)
	rows := make(output.OrderedRows, 0, len(names))
	for _, n := range names {
		rows = append(rows, output.OrderedRow{{Key: keyName, Value: n}})
	}
	return rows, nil
}

// envvarKeyForFormat mirrors Node's per-format key swap in vip-config-envvar-
// list.js and vip-config-envvar-get-all.js: keyValue -> "key", ids -> "id",
// everything else -> "name".
func envvarKeyForFormat(cmd *cobra.Command) string {
	f, _ := cmd.Flags().GetString("format")
	switch f {
	case "keyValue":
		return "key"
	case "ids":
		return "id"
	default:
		return "name"
	}
}

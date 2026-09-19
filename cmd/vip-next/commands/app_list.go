package commands

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/output"
)

// AppListCmd returns the `vip app list` command.
//
// Wraps the genqlient AppList query. Empty results and fetch errors both
// print to stdout and exit 0 to match Node's vip-app-list.js behavior
// (see Automattic/vip-cli src/bin/vip-app-list.js).
func AppListCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "list",
		Short: "List applications",
		Long:  "Retrieve a list of applications that can be accessed by the current authenticated VIP-CLI user.",
	}
	// Node registers --format via the command factory before any bin option,
	// so it wins the auto-derived -f (src/lib/cli/command.js:1090-1095).
	cmd.Flags().StringP("format", "f", "table",
		"Render output in a particular format. Accepts \"table\" (default), \"csv\", \"json\".")
	cfg := GetConfig()
	mw := []appctx.Middleware{}
	if cfg.Tracker != nil {
		mw = append(mw, appctx.WithTelemetry(cfg.Tracker, "app_list", nil))
	}
	return appctx.Build(cmd, mw...).WithRenderableRun(
		appctx.WithFormat(cmd, "table", "table", "csv", "json")(runAppList),
	)
}

func runAppList(cmd *cobra.Command, args []string) (any, error) {
	cfg := GetConfig()
	first := int64(100)
	resp, err := gql.AppList(cmd.Context(), cfg.GQLClient, &first, nil)
	if err != nil {
		// Node parity: print fetch errors to stdout and exit 0.
		fmt.Fprintf(cmd.OutOrStdout(), "Failed to fetch apps: %s\n", err.Error())
		if cfg.Tracker != nil {
			cfg.Tracker.TrackEvent("app_list_command_fetch_error", map[string]any{"error": err.Error()})
		}
		return nil, nil
	}
	if resp.Apps == nil || len(resp.Apps.Edges) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "No apps found")
		return nil, nil
	}
	rows := make(output.OrderedRows, 0, len(resp.Apps.Edges))
	for _, e := range resp.Apps.Edges {
		if e == nil {
			continue
		}
		row := output.OrderedRow{
			{Key: "id", Value: derefAny(e.Id)},
			{Key: "name", Value: derefAny(e.Name)},
			{Key: "repo", Value: derefAny(e.Repo)},
		}
		rows = append(rows, row)
	}
	return rows, nil
}

// derefAny flattens a *T into its value, returning "" for nil pointers.
// Handles the genqlient pointer-optional fields M5 handlers consume.
func derefAny(v any) any {
	switch p := v.(type) {
	case *int64:
		if p == nil {
			return ""
		}
		return *p
	case *int:
		if p == nil {
			return ""
		}
		return *p
	case *string:
		if p == nil {
			return ""
		}
		return *p
	case nil:
		return ""
	default:
		return v
	}
}

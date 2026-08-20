package commands

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/logsapi"
	"github.com/Automattic/vip/internal/output"
	"github.com/Automattic/vip/internal/polling"
)

// Node parity constants (src/bin/vip-logs.js):
//
//	LIMIT_MIN=1, LIMIT_MAX=5000, LIMIT_DEFAULT=500
//	ALLOWED_TYPES={app, batch}
//	ALLOWED_FORMATS={csv, json, table, text}
const (
	logsLimitMin     = 1
	logsLimitMax     = 5000
	logsLimitDefault = 500
)

var (
	logsAllowedTypes   = []string{"app", "batch"}
	logsAllowedFormats = []string{"table", "csv", "json", "text"}
)

// LogsCmd returns `vip logs`. Wraps logsapi.RecentLogs for one-shot fetches
// and threads --follow through internal/polling.Loop (server-hinted backoff
// with min/max clamping). Node parity:
//   - "Invalid type/limit/format" error wording matches src/bin/vip-logs.js.
//   - Empty result prints "No logs found" to stderr + exit 0.
//   - Tab characters in messages are replaced with 4 spaces for table format
//     output (Node's printLogs: message.replace(/\t/g, '    ')).
func LogsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "logs",
		Short: "Retrieve runtime logs for an environment",
		Long:  "Retrieve application or batch runtime logs for a VIP Platform environment.",
	}
	// vip-logs.js registers type/limit/follow/format in that order, so -f
	// goes to --follow and --format is left with no short (command.js:62-82).
	cmd.Flags().StringP("type", "t", "app", `Type of logs to retrieve. Accepts "app" or "batch".`)
	cmd.Flags().IntP("limit", "l", logsLimitDefault, fmt.Sprintf("Maximum number of entries to return (1..%d).", logsLimitMax))
	cmd.Flags().BoolP("follow", "f", false, "Output new entries as they are generated.")
	return buildAppEnvRenderableCmd(cmd, "table", logsAllowedFormats, runLogs)
}

func runLogs(cmd *cobra.Command, args []string) (any, error) {
	logType, _ := cmd.Flags().GetString("type")
	limit, _ := cmd.Flags().GetInt("limit")
	follow, _ := cmd.Flags().GetBool("follow")
	format, _ := cmd.Flags().GetString("format")
	if format == "" {
		format = "table"
	}
	if err := validateLogsInputs(logType, limit); err != nil {
		return nil, err
	}

	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return nil, errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	trackEvent("logs_command_execute", map[string]any{"type": logType, "limit": limit, "follow": follow, "format": format})

	if follow {
		// Follow mode bypasses WithFormat's terminal Render call (the loop
		// renders each page itself). Signal that by returning (nil, err)
		// directly from the wrapped handler — output.Render is a no-op on
		// nil data.
		err := polling.Loop(cmd.Context(), polling.Opts{
			InitialLimit:    limit,
			FollowLimit:     logsLimitMax,
			DefaultInterval: 30 * time.Second,
			ServerHintMin:   5 * time.Second,
			ServerHintMax:   5 * time.Minute,
		}, func(ctx context.Context, after *string, fetchLimit int) (polling.Page, error) {
			page, ferr := logsapi.RecentLogs(ctx, cfg.GQLClient, ae.App.ID, ae.Env.ID, logType, fetchLimit, after)
			if ferr != nil {
				return polling.Page{}, ferr
			}
			rendered := func() error {
				return renderLogsPage(cmd.OutOrStdout(), output.Format(format), page.Nodes)
			}
			return polling.Page{
				Render:           rendered,
				NextCursor:       page.NextCursor,
				PollingDelaySecs: page.PollingDelaySeconds,
			}, nil
		})
		return nil, err
	}

	page, err := logsapi.RecentLogs(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID, logType, limit, nil)
	if err != nil {
		trackEvent("logs_command_error", map[string]any{"error": err.Error()})
		return nil, err
	}
	trackEvent("logs_command_success", map[string]any{"total": len(page.Nodes)})
	if len(page.Nodes) == 0 {
		fmt.Fprintln(os.Stderr, "No logs found")
		return nil, nil
	}
	return logRowsFromNodes(page.Nodes), nil
}

// validateLogsInputs ports Node's vip-logs.js validateInputs. Note that the
// format check is performed by appctx.WithFormat with the same wording, so
// this layer only handles type/limit. We keep both checks in Node's order
// (type, then limit) — but WithFormat wraps this handler, so format errors
// surface from the outer layer.
func validateLogsInputs(logType string, limit int) error {
	if !containsStr(logsAllowedTypes, logType) {
		return fmt.Errorf("Invalid type: %s. The supported types are: %s.",
			logType, strings.Join(logsAllowedTypes, ", "))
	}
	if limit < logsLimitMin || limit > logsLimitMax {
		return fmt.Errorf("Invalid limit: %d. Set the limit to an integer between %d and %d.",
			limit, logsLimitMin, logsLimitMax)
	}
	return nil
}

func containsStr(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

// logRowsFromNodes flattens LogNodes into OrderedRows for output.Render.
// Node parity: message.replace(/\t/g, '    ') in printLogs. This lives at
// the row-builder layer so all formats benefit (Node only does it for the
// table format; we apply it uniformly for simplicity, which is a safe
// extension — tabs in log lines are rare and a 4-space substitute renders
// the same in every format).
func logRowsFromNodes(nodes []logsapi.LogNode) output.OrderedRows {
	rows := make(output.OrderedRows, 0, len(nodes))
	for _, n := range nodes {
		msg := strings.ReplaceAll(n.Message, "\t", "    ")
		rows = append(rows, output.OrderedRow{
			{Key: "timestamp", Value: n.Timestamp},
			{Key: "message", Value: msg},
		})
	}
	return rows
}

// renderLogsPage is called inside the polling loop to render a single
// page's worth of nodes. Empty pages render nothing (Node parity:
// printLogs is only called when nodes.length > 0 in the follow path).
func renderLogsPage(w io.Writer, f output.Format, nodes []logsapi.LogNode) error {
	if len(nodes) == 0 {
		return nil
	}
	return output.Render(w, f, logRowsFromNodes(nodes))
}

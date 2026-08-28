package commands

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/output"
	"github.com/Automattic/vip/internal/polling"
	"github.com/Automattic/vip/internal/slowlogsapi"
)

// Node parity constants. THERE ARE TWO `LIMIT_MAX`es AND THEY DIFFER — do
// not collapse them:
//
//   - src/lib/app-slowlogs/app-slowlogs.ts:9 `export const LIMIT_MAX = 5000`
//     is what validateInputs actually gates --limit on
//     (vip-slowlogs.ts:167 `limit > slowlogsLib.LIMIT_MAX`).
//   - src/bin/vip-slowlogs.ts:21 `const LIMIT_MAX = 500` (module-local) is
//     referenced ONLY by followLogs' refetch size (line 78
//     `const limit = isFirstRequest ? opt.limit : LIMIT_MAX`).
//
// Node's own --help copy quotes the wrong one ("Accepts an integer value
// between 1 and 500", vip-slowlogs.ts:201). The code wins: 1..5000 is
// accepted. The help string below reproduces Node's wording verbatim,
// including that inaccuracy, because it is user-visible cutover surface.
//
// ALLOWED_FORMATS={csv, json, table} — NO text format, unlike vip logs.
const (
	slowlogsLimitMin = 1
	// slowlogsValidationMax = slowlogsLib.LIMIT_MAX (app-slowlogs.ts:9).
	slowlogsValidationMax = 5000
	// slowlogsFollowLimit = the module-local LIMIT_MAX (vip-slowlogs.ts:21).
	slowlogsFollowLimit  = 500
	slowlogsLimitDefault = 500
)

var slowlogsAllowedFormats = []string{"table", "csv", "json"}

// SlowlogsCmd returns `vip slowlogs`. Mirrors LogsCmd's shape — same
// 1..5000 limit ceiling — with the slowlog row schema
// (timestamp, rowsSent, rowsExamined, queryTime, requestUri, query),
// and no `text` format (Node parity — vip-slowlogs.ts uses formatData
// only).
//
// Note: Node's vip-slowlogs.ts declares `followLogs` but does not expose
// a `--follow` flag. We add it as a Go-side extension because the
// polling primitive is the same as `vip logs` and there's no downside
// to surfacing it — `getRecentSlowlogs` already accepts an `after`
// cursor in the Node lib.
func SlowlogsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "slowlogs",
		Short: "Retrieve MySQL slow-query logs for an environment",
		Long:  "Retrieve MySQL slow-query log entries for a VIP Platform environment.",
	}
	// vip-slowlogs.ts sets format:true in the factory, so --format takes -f
	// and --limit takes -l. (--follow is vip-next-only: Node never registers
	// it on slowlogs, even though followLogs exists in the lib.)
	cmd.Flags().StringP("format", "f", "table",
		"Render output in a particular format.")
	// Verbatim Node copy (vip-slowlogs.ts:201). It says 500; the validator
	// accepts up to 5000. See the constant block above.
	cmd.Flags().IntP("limit", "l", slowlogsLimitDefault,
		"Set the maximum number of log entries. Accepts an integer value between 1 and 500.")
	cmd.Flags().Bool("follow", false, "Output new entries as they are generated.")
	return buildAppEnvRenderableCmd(cmd, "table", slowlogsAllowedFormats, runSlowlogs)
}

func runSlowlogs(cmd *cobra.Command, args []string) (any, error) {
	limit, _ := cmd.Flags().GetInt("limit")
	follow, _ := cmd.Flags().GetBool("follow")
	format, _ := cmd.Flags().GetString("format")
	if format == "" {
		format = "table"
	}
	if err := validateSlowlogsInputs(limit); err != nil {
		return nil, err
	}

	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return nil, errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	trackEvent("slowlogs_command_execute", map[string]any{"limit": limit, "follow": follow, "format": format})

	if follow {
		err := polling.Loop(cmd.Context(), polling.Opts{
			InitialLimit:    limit,
			FollowLimit:     slowlogsFollowLimit,
			DefaultInterval: 30 * time.Second,
			ServerHintMin:   5 * time.Second,
			ServerHintMax:   5 * time.Minute,
		}, func(ctx context.Context, after *string, fetchLimit int) (polling.Page, error) {
			page, ferr := slowlogsapi.RecentSlowlogs(ctx, cfg.GQLClient, ae.App.ID, ae.Env.ID, fetchLimit, after)
			if ferr != nil {
				return polling.Page{}, ferr
			}
			rendered := func() error {
				return renderSlowlogsPage(cmd.OutOrStdout(), output.Format(format), page.Nodes)
			}
			return polling.Page{
				Render:           rendered,
				NextCursor:       page.NextCursor,
				PollingDelaySecs: page.PollingDelaySeconds,
			}, nil
		})
		return nil, err
	}

	page, err := slowlogsapi.RecentSlowlogs(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID, limit, nil)
	if err != nil {
		trackEvent("slowlogs_command_error", map[string]any{"error": err.Error()})
		return nil, err
	}
	trackEvent("slowlogs_command_success", map[string]any{"total": len(page.Nodes)})
	if len(page.Nodes) == 0 {
		// Node parity: vip-slowlogs.ts also prints 'No logs found' (yes, the
		// same wording as vip-logs) to console.error and returns.
		fmt.Fprintln(os.Stderr, "No logs found")
		return nil, nil
	}
	return slowlogRowsFromNodes(page.Nodes), nil
}

// validateSlowlogsInputs ports Node's vip-slowlogs.ts validateInputs.
// Format validation is delegated to appctx.WithFormat (same wording).
func validateSlowlogsInputs(limit int) error {
	if limit < slowlogsLimitMin || limit > slowlogsValidationMax {
		return fmt.Errorf("Invalid limit: %d. Set the limit to an integer between %d and %d.",
			limit, slowlogsLimitMin, slowlogsValidationMax)
	}
	return nil
}

// slowlogRowsFromNodes flattens SlowlogNodes into OrderedRows. Column
// ordering matches Node's printSlowlogs destructuring:
//
//	{ timestamp, rowsSent, rowsExamined, queryTime, requestUri, query }.
func slowlogRowsFromNodes(nodes []slowlogsapi.SlowlogNode) output.OrderedRows {
	rows := make(output.OrderedRows, 0, len(nodes))
	for _, n := range nodes {
		rows = append(rows, output.OrderedRow{
			{Key: "timestamp", Value: n.Timestamp},
			{Key: "rowsSent", Value: n.RowsSent},
			{Key: "rowsExamined", Value: n.RowsExamined},
			{Key: "queryTime", Value: n.QueryTime},
			{Key: "requestUri", Value: n.RequestUri},
			{Key: "query", Value: n.Query},
		})
	}
	return rows
}

func renderSlowlogsPage(w io.Writer, f output.Format, nodes []slowlogsapi.SlowlogNode) error {
	if len(nodes) == 0 {
		return nil
	}
	return output.Render(w, f, slowlogRowsFromNodes(nodes))
}

package commands

import (
	"errors"
	"time"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/output"
)

// syncConfirmPayload is the `case 'sync'` arm of Node's requireConfirm
// switch (src/lib/cli/command.js:913-933).
//
// Node reads options.env.syncPreview, which vip-sync.js pulls in through its
// appQuery. vip-next resolves app/env with a shared query, so the preview is
// fetched here, at exactly the point Node consumes it.
//
// Order of operations is Node's, and it matters:
//  1. canSync false -> exit 1 with the SERVER's first error message, BEFORE
//     the prompt and therefore before the destructive mutation. vip-next
//     previously never queried syncPreview and fired a sync the server would
//     have refused.
//  2. `From backup` row, only when the preview carries a backup.
//  3. `Replacements` row, always — value is "\n" + the table, and Node's
//     formatData returns "" for an empty list, so an empty replacement set
//     renders as a bare label plus a blank line.
//
// Node-parity quirk (deliberate): this entire arm lives inside
// `if (_opts.requireConfirm && ! options.force)`, so `--skip-confirmation` /
// `--force` skips the canSync guard too. Do NOT hoist the guard out of the
// payload — that would block syncs the Node CLI allows.
func syncConfirmPayload(cmd *cobra.Command, _ []string, message string) ([]output.Tuple, string, error) {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return nil, message, errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()

	resp, err := gql.SyncPreview(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID)
	if err != nil {
		return nil, message, err
	}

	var preview *gql.SyncPreviewAppEnvironmentsAppEnvironmentSyncPreview
	if resp != nil && resp.App != nil && len(resp.App.Environments) > 0 && resp.App.Environments[0] != nil {
		preview = resp.App.Environments[0].SyncPreview
	}
	if preview == nil {
		// Node destructures options.env.syncPreview unconditionally, so a
		// null preview throws a TypeError and dies via the uncaughtException
		// handler ("Please contact VIP Support", exit 1). vip-next refuses
		// with a readable message instead of crashing — a deliberate
		// improvement, and it still fails closed.
		return nil, message, errors.New("Could not sync to this environment: the API returned no sync preview")
	}

	if preview.CanSync == nil || !*preview.CanSync {
		return nil, message, errors.New("Could not sync to this environment: " + firstSyncErrorMessage(preview.Errors))
	}

	var rows []output.Tuple
	if b := preview.Backup; b != nil && b.CreatedAt != nil {
		rows = append(rows, output.Tuple{Key: "From backup", Value: toUTCString(*b.CreatedAt)})
	}

	replacements := make(output.OrderedRows, 0, len(preview.Replacements))
	for _, r := range preview.Replacements {
		if r == nil {
			continue
		}
		replacements = append(replacements, output.OrderedRow{
			{Key: "from", Value: derefString(r.From)},
			{Key: "to", Value: derefString(r.To)},
		})
	}
	rows = append(rows, output.Tuple{Key: "Replacements", Value: "\n" + output.TableString(replacements)})

	return rows, message, nil
}

// firstSyncErrorMessage mirrors Node's `errors[0].message` — only the first
// validation error is shown.
func firstSyncErrorMessage(errs []*gql.SyncPreviewAppEnvironmentsAppEnvironmentSyncPreviewErrorsAppEnvironmentSyncError) string {
	for _, e := range errs {
		if e != nil && e.Message != nil {
			return *e.Message
		}
	}
	// Node would throw on errors[0] of an empty array; we degrade to a
	// readable reason rather than crashing.
	return "the API did not provide a reason"
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// toUTCString ports JavaScript's Date#toUTCString for the "From backup"
// value: "Mon, 21 Jul 2025 10:11:12 GMT". An unparseable input yields
// "Invalid Date", exactly as `new Date('garbage').toUTCString()` does.
func toUTCString(value string) string {
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, l := range layouts {
		if t, err := time.Parse(l, value); err == nil {
			return t.UTC().Format("Mon, 02 Jan 2006 15:04:05 GMT")
		}
	}
	return "Invalid Date"
}

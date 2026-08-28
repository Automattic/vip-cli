package commands

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/gql"
	syncpkg "github.com/Automattic/vip/internal/sync"
)

// SyncCmd returns `vip sync`.
//
// Node parity: src/bin/vip-sync.js. Production targets are rejected by
// WithChildEnvContext; --skip-confirmation (or a "yes" at the
// "Are you sure..." prompt) is required before the mutation fires.
//
// Rendering split:
//   - TTY stderr: in-place frame rendering via internal/tui.MultiLineRenderer
//     with a Node-parity braille spinner advanced on a background ticker.
//     See sync_render.go for the renderer + spinner glue.
//   - Non-TTY (CI, pipes, parity scenarios): one per-transition stdout
//     line, unchanged from the pre-spinner behavior so the M6 parity
//     scenarios keep passing without modification.
//
// VIP_SYNC_INTERVAL_MS overrides the 5s default poll interval. Used by
// the parity scenarios to keep the test wall-clock under a second.
func SyncCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "sync",
		Short: "Sync data from the production environment to a child environment",
		Long: "Trigger a data sync from the production environment of an app into one of its child environments " +
			"(develop, staging, ...). Production is the source and is therefore not a valid target.",
		Args: cobra.NoArgs,
	}

	addAppEnvFlags(cmd)
	addSkipConfirmationWithForceAlias(cmd)
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithSkipConfirmationFlag(cmd),
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithChildEnvContext(),
		appctx.WithRequireConfirm(cmd, "Are you sure you want to sync from production?", syncConfirmPayload),
	).WithRun(runSync)
}

func runSync(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	out := cmd.OutOrStdout()

	trackEvent("sync_command_execute", nil)

	// Opt the mutation out of the error-middleware's print + Exit(1)
	// behavior so we can intercept "Site is already syncing" inline and
	// fall through to polling (Node parity).
	mutCtx := gql.WithAllowGQLErrors(cmd.Context())

	syncing := false
	if err := syncpkg.Start(mutCtx, cfg.GQLClient, ae.App.ID, ae.Env.ID); err != nil {
		var ase syncpkg.AlreadySyncingError
		if errors.As(err, &ase) {
			syncing = true
			trackEvent("sync_command_execute_error", map[string]any{
				"error": "Already syncing: " + err.Error(),
			})
		} else {
			// Node parity: print "Error: <msg>" and return (exit 0). The
			// allowed-errors context bypassed the middleware's auto-print,
			// so we replicate it here.
			fmt.Fprintln(out, color.RedString("Error: "+err.Error()))
			return nil
		}
	}

	// Banner — printed regardless of whether the mutation succeeded fresh
	// or we joined an existing run. Yellow app name + colored env types.
	if syncing {
		fmt.Fprintln(out, color.YellowString("Note:"), "A data sync is already running.")
	}
	fmt.Fprintln(out)
	fmt.Fprintf(out, "  syncing: %s\n", color.YellowString(ae.App.Name))
	fmt.Fprintf(out, "     from: %s\n", formatEnvironment("production"))
	fmt.Fprintf(out, "       to: %s\n", formatEnvironment(ae.Env.Type))

	// Poll to terminal state. Rendering surface depends on whether
	// stderr is a TTY: in-place frames for humans, per-transition
	// stdout lines for CI. Status query also uses the allow-errors
	// context so transient server hiccups (e.g. the first call before
	// the job materializes) don't kill the process before we retry.
	pollCtx := gql.WithAllowGQLErrors(cmd.Context())
	var renderer syncRenderer
	if term.IsTerminal(int(os.Stderr.Fd())) {
		renderer = newTTYRenderer(os.Stderr)
	} else {
		renderer = newNonTTYRenderer(out)
	}
	defer renderer.Stop()

	p, err := syncpkg.Poll(pollCtx, cfg.GQLClient, ae.App.ID, ae.Env.ID, syncpkg.PollOpts{
		Interval:     pollInterval(),
		OnTransition: renderer.OnTransition,
		OnError: func(_ error) bool {
			// Treat all Status errors as transient — Node's setInterval
			// just keeps ticking and ignores per-poll errors.
			return true
		},
	})
	// Stop the renderer BEFORE printing the terminal status line so the
	// final line lands cleanly below the (now-frozen) frame on TTY and
	// the background spinner goroutine is shut down before we move on.
	renderer.Stop()
	if err != nil {
		// Context cancel / deadline: surface to caller (Node exits 0 on
		// ^C too, but we honor errors.Is(context.Canceled) silently).
		if errors.Is(err, cmd.Context().Err()) {
			return nil
		}
		fmt.Fprintln(out, color.RedString("Error: "+err.Error()))
		return nil
	}

	if p == nil {
		// No progress payload — surface a generic "finished" message so
		// callers see a terminal line.
		fmt.Fprintln(out, color.GreenString(
			fmt.Sprintf("✓ Data Sync is finished for %s.", ae.App.Name)))
		trackEvent("sync_command_success", nil)
		return nil
	}

	switch p.Status {
	case syncpkg.StatusFailed:
		trackEvent("sync_command_error", map[string]any{
			"error": "API returned `failed` status",
		})
		fmt.Fprintln(out, color.RedString(
			fmt.Sprintf("✕ Data Sync is finished for %s.", ae.App.Name)))
	default:
		// success (or any non-failed terminal) — Node treats the default
		// case as success, so we do too.
		trackEvent("sync_command_success", nil)
		fmt.Fprintln(out, color.GreenString(
			fmt.Sprintf("✓ Data Sync is finished for %s.", ae.App.Name)))
	}
	// Node parity: failed syncs still exit 0 (the message goes to stdout,
	// no non-zero return).
	return nil
}

// formatStepLine returns the colored "  <mark> <name>" line printed
// per step transition. Mirrors Node's per-status marks.
func formatStepLine(s syncpkg.Step) string {
	switch s.Status {
	case syncpkg.StatusPending:
		return color.New(color.Faint).Sprintf("  ○ %s", s.Name)
	case syncpkg.StatusRunning:
		return fmt.Sprintf("  %s %s", color.HiBlueString("…"), s.Name)
	case syncpkg.StatusSuccess:
		return fmt.Sprintf("  %s %s", color.GreenString("✓"), s.Name)
	case syncpkg.StatusFailed:
		return fmt.Sprintf("  %s %s", color.RedString("✕"), s.Name)
	default:
		return fmt.Sprintf("  %s %s", color.YellowString("✕"), s.Name)
	}
}

// pollInterval returns the configured polling interval. VIP_SYNC_INTERVAL_MS
// overrides the default to a millisecond value; parity tests set it to a
// few ms to keep wall-clock short.
func pollInterval() time.Duration {
	if v := os.Getenv("VIP_SYNC_INTERVAL_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return syncpkg.DefaultInterval
}

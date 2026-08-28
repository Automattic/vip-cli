package commands

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/fatih/color"
	"github.com/pkg/browser"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/phpmyadmin"
)

// openURLFn is a package-level seam so tests can avoid actually opening
// the user's browser when exercising the default (non --print) path.
// Production wires browser.OpenURL.
var openURLFn = browser.OpenURL

// DBPhpmyadminCmd returns `vip db phpmyadmin`. Node parity:
// src/bin/vip-db-phpmyadmin.ts + src/commands/phpmyadmin.ts. The actual
// three-op enable+poll+generate flow lives in internal/phpmyadmin; this
// command just resolves --print / --silent and dispatches.
func DBPhpmyadminCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "phpmyadmin",
		Short: "Generate access to a read-only phpMyAdmin web interface",
		Long: "Generate access to a read-only phpMyAdmin web interface for the environment's database.\n\n" +
			"By default the URL is opened in your browser. Use --print to write it to stdout instead.",
	}
	cmd.Flags().BoolP("print", "p", false, "Print the phpMyAdmin URL to stdout instead of opening it in a browser.")
	cmd.Flags().BoolP("silent", "s", false, "Do not print any output to the console.")
	return buildAppEnvCmd(cmd, runDBPhpmyadmin)
}

// The phpMyAdmin timings follow the documented VIP_*_MS knob shape
// (VIP_BACKUP_DB_INTERVAL_MS, VIP_EXPORT_SQL_INTERVAL_MS) so the 6h ceiling
// and the 30s load-balancer settle are reachable in a test.

// phpmyadminPollInterval — pollUntil's 1000ms tick (phpmyadmin.ts:217).
func phpmyadminPollInterval() time.Duration {
	if v := os.Getenv("VIP_PHPMYADMIN_INTERVAL_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return phpmyadmin.DefaultPollInterval
}

// phpmyadminPollTimeout — pollUntil's default 6h ceiling (utils.ts:18).
func phpmyadminPollTimeout() time.Duration {
	if v := os.Getenv("VIP_PHPMYADMIN_TIMEOUT_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return phpmyadmin.DefaultPollTimeout
}

// phpmyadminPostEnableWait — the 30s LB settle after a cold enable
// (phpmyadmin.ts:219-220). An explicit 0 disables the wait entirely, which
// is expressed to internal/phpmyadmin as a negative duration (its zero value
// means "use the default").
func phpmyadminPostEnableWait() time.Duration {
	if v := os.Getenv("VIP_PHPMYADMIN_POST_ENABLE_WAIT_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			if n <= 0 {
				return -1
			}
			return time.Duration(n) * time.Millisecond
		}
	}
	return phpmyadmin.DefaultPostEnableWait
}

func runDBPhpmyadmin(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	printURL, _ := cmd.Flags().GetBool("print")
	silent, _ := cmd.Flags().GetBool("silent")
	cfg := GetConfig()

	trackEvent("phpmyadmin_command_execute", map[string]any{
		"app": ae.App.ID,
		"env": ae.Env.ID,
	})

	// Node prints a yellow warning that PMA sessions are read-only before
	// kicking the progress tracker. We match that here, but on stderr to
	// keep stdout clean for --print consumers.
	if !silent {
		fmt.Fprintln(cmd.ErrOrStderr(), color.YellowString(
			"Note: PHPMyAdmin sessions are read-only. If you run a query that writes to DB, it will fail."))
	}

	res, err := phpmyadmin.Run(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID, phpmyadmin.RunOpts{
		Silent:         silent,
		Stderr:         cmd.ErrOrStderr(),
		PollInterval:   phpmyadminPollInterval(),
		PollTimeout:    phpmyadminPollTimeout(),
		PostEnableWait: phpmyadminPostEnableWait(),
	})
	if err != nil {
		trackEvent("phpmyadmin_command_error", map[string]any{"error": err.Error()})
		return err
	}
	trackEvent("phpmyadmin_command_success", nil)

	if printURL {
		fmt.Fprintln(cmd.OutOrStdout(), res.URL)
		return nil
	}
	if !silent {
		fmt.Fprintln(cmd.ErrOrStderr(), "phpMyAdmin is opened in your default browser.")
	}
	return openURLFn(res.URL)
}

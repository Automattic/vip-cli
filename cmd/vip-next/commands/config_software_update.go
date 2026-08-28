package commands

// ConfigSoftwareUpdateCmd implements `vip config software update <component> <version>`.
//
// Interactive-args deviation (intentional): Node prompts (Select) when component
// or version are omitted. vip-next requires both as positional args: this keeps
// the CLI scriptable and matches documented usage. On a single-component app the
// component arg is still required for predictability. Multi-component apps without
// a component get a "Please specify a component" error.
//
// Node parity source: src/bin/vip-config-software-update.js + src/lib/config/software.ts.

import (
	"errors"
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/softwaresettings"
)

// softwareUpdatePollInterval is the delay between SoftwareUpdateJob polls.
// Injectable via tests (set to a short duration).
var softwareUpdatePollInterval = 5 * time.Second

// ConfigSoftwareUpdateCmd returns the `vip config software update` leaf command.
func ConfigSoftwareUpdateCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "update <component> <version>",
		Short: "Update software settings for an environment",
		Long: "Update a software component (wordpress, php, muplugins, nodejs) to the " +
			"specified version for a VIP Platform environment.\n\n" +
			"Note: both <component> and <version> are required positional arguments. " +
			"Node.js apps support only the 'nodejs' component; WordPress apps support " +
			"'wordpress', 'php', and 'muplugins'.",
		Args: cobra.ExactArgs(2),
	}
	cmd.Flags().BoolP("yes", "y", false, "Skip the confirmation prompt")
	return buildAppEnvCmd(cmd, runConfigSoftwareUpdate)
}

func runConfigSoftwareUpdate(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}

	component := args[0]
	version := args[1]

	cfg := GetConfig()
	trackEvent("config_software_update_execute", map[string]any{
		"component": component,
		"version":   version,
	})

	// Fetch software settings for version validation.
	resp, err := gql.SoftwareSettings(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID)
	if err != nil {
		return err
	}
	if resp.App == nil || len(resp.App.Environments) == 0 {
		return errors.New("Software settings are not supported for this environment.")
	}
	env := resp.App.Environments[0]
	ss := env.SoftwareSettings
	if ss == nil {
		return errors.New("Software settings are not supported for this environment.")
	}

	// Validate component against app type.
	resolvedComponent, err := softwaresettings.ResolveComponent(ae.App.TypeId, component)
	if err != nil {
		return err
	}

	// Find the gql node for the resolved component and convert to Software.
	type entry struct {
		slug string
		node gqlSoftwareNode
	}
	allComponents := []entry{
		{"wordpress", gqlNodeFrom(ss.Wordpress)},
		{"php", gqlNodeFrom(ss.Php)},
		{"muplugins", gqlNodeFrom(ss.Muplugins)},
		{"nodejs", gqlNodeFrom(ss.Nodejs)},
	}
	var setting softwaresettings.Software
	for _, e := range allComponents {
		if e.slug == resolvedComponent && e.node != nil {
			setting = gqlNodeToSoftware(e.node)
			break
		}
	}

	// Validate version against allowed options.
	resolvedVersion, err := softwaresettings.ResolveVersion(setting, resolvedComponent, version)
	if err != nil {
		return err
	}

	// Confirm unless --yes is set.
	//
	// A declined (or unanswerable) confirm is a FAILURE here, not a quiet no-op.
	// Node's promptForUpdate throws `UserError( 'Update canceled' )`
	// (software.ts:335) and command.js routes UserError to exit.withError →
	// exit 1. This is the one place in the CLI where Node does not use the
	// `console.log('Command cancelled'); process.exit()` (exit 0) convention it
	// uses for envvar set/delete and `vip wp`'s production gate — so returning
	// nil here made a CI run that forgot --yes report a successful update it
	// never performed.
	yes, _ := cmd.Flags().GetBool("yes")
	if !yes {
		msg := fmt.Sprintf("Are you sure you want to upgrade %s to %s?",
			softwaresettings.ComponentDisplayName(resolvedComponent), resolvedVersion)
		ok, confirmErr := appctx.Confirm(cmd, msg, false)
		switch {
		case errors.Is(confirmErr, appctx.ErrNonInteractive), confirmErr == nil && !ok:
			return errors.New("Update canceled")
		case confirmErr != nil:
			return errors.New("Command cancelled by user.")
		}
	}

	// Fire the mutation.
	_, err = gql.UpdateSoftwareSettings(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID, resolvedComponent, resolvedVersion)
	if err != nil {
		trackEvent("config_software_update_error", map[string]any{"error": err.Error()})
		return err
	}

	trackEvent("config_software_update_mutation_success", nil)

	// Poll until the update job completes.
	if err := pollSoftwareUpdateJob(cmd, cfg, ae); err != nil {
		trackEvent("config_software_update_poll_error", map[string]any{"error": err.Error()})
		return err
	}

	trackEvent("config_software_update_success", map[string]any{
		"component": resolvedComponent,
		"version":   resolvedVersion,
	})
	fmt.Fprintf(cmd.OutOrStdout(), "Successfully updated %s to %s.\n",
		softwaresettings.ComponentDisplayName(resolvedComponent), resolvedVersion)
	return nil
}

// jobIface is a convenience alias for the genqlient pointer-to-interface
// element type that GetJobs() returns.
type jobIface = gql.SoftwareUpdateJobAppEnvironmentsAppEnvironmentJobsJobInterface

// pollSoftwareUpdateJob polls SoftwareUpdateJob until the update completes or
// fails. It mirrors getUpdateResult/_getCompletedJob in software.ts:
//   - picks the latest job by createdAt
//   - while inProgressLock → keep polling
//   - success when no job or progress.status == "success"
//   - failure: find a step with status "failed" → "Failed during step: <name>" else "Software update failed"
func pollSoftwareUpdateJob(cmd *cobra.Command, cfg Config, ae *appctx.AppEnv) error {
	for {
		resp, err := gql.SoftwareUpdateJob(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID)
		if err != nil {
			return err
		}

		// Navigate to jobs.
		if resp.App == nil || len(resp.App.Environments) == 0 || resp.App.Environments[0] == nil {
			// No environment data → treat as success (job gone).
			return nil
		}
		jobs := resp.App.Environments[0].GetJobs()
		if len(jobs) == 0 {
			// No jobs → update complete (Node parity: "no job" = success).
			return nil
		}

		// Pick the latest job by createdAt (string ISO8601 comparison works
		// lexicographically for same-timezone values, matching Node behaviour).
		// jobs elements are *jobIface (pointer-to-interface); dereference to call methods.
		latestPtr := jobs[0]
		for _, jPtr := range jobs[1:] {
			if jPtr == nil || *jPtr == nil {
				continue
			}
			latestCA := ""
			if latestPtr != nil && *latestPtr != nil {
				if ca := (*latestPtr).GetCreatedAt(); ca != nil {
					latestCA = *ca
				}
			}
			jCA := ""
			if ca := (*jPtr).GetCreatedAt(); ca != nil {
				jCA = *ca
			}
			if jCA > latestCA {
				latestPtr = jPtr
			}
		}
		if latestPtr == nil || *latestPtr == nil {
			return nil
		}
		latest := *latestPtr

		// Still in-progress → wait and retry.
		if lock := latest.GetInProgressLock(); lock != nil && *lock {
			time.Sleep(softwareUpdatePollInterval)
			continue
		}

		// Terminal: inspect progress.
		//
		// Node's success test is exactly `! completedJob || progress?.status
		// === 'success'` (software.ts:398) — a missing progress object and an
		// empty status are NOT success, they fall through to the error branch.
		// vip-next used to short-circuit both to success, so an update whose
		// job never reported a result printed "Successfully updated" and exited
		// 0 (silent no-op in CI).
		prog := latest.GetProgress()
		status := ""
		if prog != nil && prog.Status != nil {
			status = *prog.Status
		}
		if status == "success" {
			return nil
		}
		// DIVERGENCE, deliberately left as-is (out of scope for the exit-code
		// remediation): Node treats any other value as terminal failure, while
		// vip-next keeps polling a non-terminal status such as "running" that
		// arrives with inProgressLock=false. That is a hang risk, not a silent
		// success — and this loop has no 6 h poll.Timeout ceiling either.
		if status != "" && status != "failed" {
			time.Sleep(softwareUpdatePollInterval)
			continue
		}
		// Node looks for a failed step regardless of the top-level status.
		if prog != nil {
			for _, step := range prog.Steps {
				if step == nil {
					continue
				}
				stepStatus := ""
				if step.Status != nil {
					stepStatus = *step.Status
				}
				if stepStatus == "failed" {
					name := ""
					if step.Name != nil {
						name = *step.Name
					}
					return errors.New("Failed during step: " + name)
				}
			}
		}
		return errors.New("Software update failed")
	}
}

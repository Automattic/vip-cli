package commands

import (
	"github.com/spf13/cobra"
)

// addSlugFlag registers the standard -s/--slug flag shared by env-targeting leaves.
func addSlugFlag(c *cobra.Command) {
	c.Flags().StringP("slug", "s", "", "A unique name for a local environment.")
}

// DevEnvCmd returns the real `vip dev-env` command tree (23 leaves). dev-env is
// auth-bypassed EXCEPT `sync` (which calls the VIP platform — see
// internal/auth/bypass.go).
func DevEnvCmd() *cobra.Command {
	root := &cobra.Command{Use: "dev-env", Short: "Manage a local VIP development environment"}

	root.AddCommand(
		devEnvCreateCmd(),
		devEnvStartCmd(),
		devEnvStopCmd(),
		devEnvDestroyCmd(),
		devEnvInfoCmd(),
		devEnvListCmd(),
		devEnvPurgeCmd(),
		devEnvUpdateCmd(),
		devEnvExecCmd(),
		devEnvShellCmd(),
		devEnvLogsCmd(),
		devEnvSyncCmd(),
		devEnvEnvvarCmd(),
		devEnvImportCmd(),
	)
	return root
}

func devEnvUpdateCmd() *cobra.Command { return newDevEnvUpdateCmd() }

func devEnvExecCmd() *cobra.Command  { return newDevEnvExecCmd() }
func devEnvShellCmd() *cobra.Command { return newDevEnvShellCmd() }

func devEnvLogsCmd() *cobra.Command { return newDevEnvLogsCmd() }

func devEnvSyncCmd() *cobra.Command { return newDevEnvSyncCmd() }

func devEnvEnvvarCmd() *cobra.Command { return newDevEnvEnvvarCmd() }

func devEnvImportCmd() *cobra.Command { return newDevEnvImportCmd() }

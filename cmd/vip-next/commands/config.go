package commands

import "github.com/spf13/cobra"

// ConfigCmd returns the `vip config` parent. Subcommands (currently just
// `envvar`) are attached in root.go so the test harness can opt into the
// subtree it needs without dragging the others.
func ConfigCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "config",
		Short: "Manage environment configuration",
		Long:  "Manage configuration for a VIP Platform environment.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}
}

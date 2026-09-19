package commands

import "github.com/spf13/cobra"

// ConfigEnvvarCmd returns the `vip config envvar` parent. Leaf commands
// list / get / get-all attach in root.go.
func ConfigEnvvarCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "envvar",
		Short: "Manage environment variables",
		Long:  "Manage environment variables for a VIP Platform environment.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}
}

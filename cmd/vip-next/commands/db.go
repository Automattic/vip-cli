package commands

import "github.com/spf13/cobra"

// DBCmd returns the `vip db` parent. Leaf subcommands attach in root.go;
// the parent itself does nothing on its own (cobra prints help by default).
func DBCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "db",
		Short: "Database operations",
		Long:  "Database operations for a VIP Platform environment.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}
}

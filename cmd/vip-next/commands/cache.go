package commands

import "github.com/spf13/cobra"

// CacheCmd returns the `vip cache` parent. Subcommands are attached in
// root.go; the parent itself just prints help.
func CacheCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "cache",
		Short: "Manage edge cache for a VIP Platform environment",
		Long:  "Manage edge cache for a VIP Platform environment.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}
}

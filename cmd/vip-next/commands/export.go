package commands

import "github.com/spf13/cobra"

// ExportCmd returns the `vip export` parent. Children attach in root.go;
// the parent itself just prints help (Node: src/bin/vip-export.js).
func ExportCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "export",
		Short: "Export data from an environment",
		Long:  "Export data (SQL database backups) from a VIP Platform environment.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}
}

package commands

import "github.com/spf13/cobra"

// ImportCmd returns the `vip import` parent. Children attach in root.go;
// the parent itself just prints help.
//
// M6b adds validate-sql; later milestones will add sql + media + the file
// validators.
func ImportCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "import",
		Short: "Validate and import data into a VIP Platform environment",
		Long:  "Validate and import data (SQL dumps, media files) into a VIP Platform environment.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}
}

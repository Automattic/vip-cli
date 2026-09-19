package commands

import "github.com/spf13/cobra"

// BackupCmd returns the `vip backup` parent. Children attach in root.go;
// the parent itself just prints help (Node: src/bin/vip-backup.ts).
func BackupCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "backup",
		Short: "Generate backups for an environment",
		Long:  "Generate database backups for a VIP Platform environment.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}
}

package commands

import "github.com/spf13/cobra"

// AppCmd returns the `vip app` parent command. Subcommands and the wildcard
// dispatcher are wired in main.go (so the wildcard sees the final subcommand
// list).
//
// --format is registered on the parent because `vip app <name>` dispatches via
// WithWildcardCommand — cobra parses flags against the matched command
// (appCmd), so the parent must own --format for RunAppGet to read it.
func AppCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "app",
		Short: "Manage VIP Platform applications",
		Long: "Manage VIP Platform applications.\n\n" +
			"Run \"vip app list\" to list applications, or \"vip app <name>\" " +
			"to view information about a specific application and its environments.",
	}
	cmd.Flags().StringP("format", "f", "table",
		"Render output in a particular format. Accepts \"table\" (default), \"csv\", \"json\".")
	return cmd
}

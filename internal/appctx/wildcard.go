package appctx

import (
	"github.com/spf13/cobra"
)

// WithWildcardCommand registers a fallback handler on a Cobra parent. When the
// parent is invoked with positional args whose first element is NOT the name
// of a registered subcommand, the fallback runs with those args. Mirrors
// Node's _opts.wildcardCommand pattern.
//
// MUST be called after all real subcommands are added to parent (snapshots
// their names at call time).
func WithWildcardCommand(parent *cobra.Command, fallback RunFunc) {
	subNames := map[string]bool{}
	for _, c := range parent.Commands() {
		subNames[c.Name()] = true
		for _, alias := range c.Aliases {
			subNames[alias] = true
		}
	}
	parent.Args = cobra.ArbitraryArgs
	parent.RunE = func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 && subNames[args[0]] {
			return cmd.Help()
		}
		return fallback(cmd, args)
	}
}

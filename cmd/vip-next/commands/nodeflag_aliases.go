package commands

import (
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

// addFormatFlagWithShort pre-registers --format with the -f short for the
// commands where Node's factory registers it before any bin option and it
// therefore wins the auto-derived 'f' (src/lib/cli/command.js:1090-1095).
// appctx.WithFormat only registers the flag when it is absent, so calling
// this first is enough. Commands where a bin option claims 'f' first
// (`vip logs --follow`) must NOT call this.
func addFormatFlagWithShort(c *cobra.Command) {
	if c.Flags().Lookup("format") == nil {
		c.Flags().StringP("format", "f", "table", "Render output in a particular format.")
	}
}

// aliasFlagName makes `--<from>` resolve to the already-registered `--<to>` at
// parse time. pflag normalizes a long flag name before looking it up
// (FlagSet.parseLongArg), so this is a true alias — one flag, two spellings —
// rather than a second flag whose value has to be merged.
//
// Shorthands are not affected: pflag looks those up in a separate table, so
// the short alias must be declared on the canonical flag itself.
func aliasFlagName(c *cobra.Command, from, to string) {
	prev := c.Flags().GetNormalizeFunc()
	c.Flags().SetNormalizeFunc(func(f *pflag.FlagSet, name string) pflag.NormalizedName {
		if name == from {
			return pflag.NormalizedName(to)
		}
		return prev(f, name)
	})
}

// addSkipConfirmationWithForceAlias registers the confirmation bypass for the
// commands whose gate came from Node's `requireConfirm`
// (src/lib/cli/command.js:1086-1088): `vip sync`, `vip import media` and
// `vip import media abort`. Node spells that flag `--force` and, because it is
// registered before the bin's own options, gives it the short `-f`.
//
// vip-next renamed it `--skip-confirmation`. The rename stands (it is the name
// used everywhere else in the Go tree), but Node's spelling and short must
// keep working or every existing script that passes `--force` fails at parse
// time. Call this BEFORE appctx.WithSkipConfirmationFlag, which is a no-op
// once the flag exists.
//
// NOTE: this deliberately does NOT resurrect Node's `--force=false` bug. In
// Node --force is a commander boolean, so `--force=false` is not recognized as
// a value form and the truthy string leaks through, SKIPPING the prompt.
// vip-next parses it as a real bool, so `--force=false` still prompts.
func addSkipConfirmationWithForceAlias(c *cobra.Command) {
	if c.Flags().Lookup("skip-confirmation") == nil {
		c.PersistentFlags().BoolP("skip-confirmation", "f", false, "Skip the confirmation prompt.")
		c.Flags().AddFlagSet(c.PersistentFlags())
	}
	aliasFlagName(c, "force", "skip-confirmation")
}

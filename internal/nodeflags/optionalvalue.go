package nodeflags

import (
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

// optionalValueAnnotation marks a flag as one of Node's `--name [value]`
// optional-value options.
const optionalValueAnnotation = "vip:optional-value"

// MarkOptionalValue gives the named flags commander's optional-value grammar:
// the bare form takes noOptDefVal, an `=value` form takes that value, and a
// following non-option token is consumed as the value (see
// NormalizeOptionalValues, which supplies the lookahead pflag lacks).
//
// Node registers every non-boolean option as `--name [value]`
// (src/lib/cli/command.js:111-114). vip-next opts in only where the bare form
// carries meaning — the dev-env service toggles and --multisite — because
// elsewhere ("--slug" with no value) Node's bare form yields the boolean
// `true`, which no handler can use.
func MarkOptionalValue(cmd *cobra.Command, noOptDefVal string, names ...string) {
	for _, name := range names {
		f := cmd.Flags().Lookup(name)
		if f == nil {
			continue
		}
		f.NoOptDefVal = noOptDefVal
		if f.Annotations == nil {
			f.Annotations = map[string][]string{}
		}
		f.Annotations[optionalValueAnnotation] = []string{"true"}
	}
}

func isOptionalValue(f *pflag.Flag) bool {
	return f != nil && len(f.Annotations[optionalValueAnnotation]) > 0
}

// isOptionToken ports Node's isOptionToken (src/lib/cli/command.js:129-131):
// a lone "-" is a value, everything else starting with "-" is an option.
func isOptionToken(arg string) bool { return arg != "-" && strings.HasPrefix(arg, "-") }

// NormalizeOptionalValues rewrites argv so cobra sees `--flag=value` wherever
// commander would have consumed the following token as an optional value.
//
// pflag has no equivalent of commander's optional-value lookahead: once a flag
// carries NoOptDefVal, `-p n` sets the flag to NoOptDefVal and leaves "n" as a
// stray positional. That is exactly the inverted-flag bug this fixes — in Node
// `-p n` DISABLES phpMyAdmin. Rewriting to `-p=n` before cobra parses restores
// commander's grammar without patching pflag.
//
// The rewrite is scoped to the command argv actually targets, so a flag name
// that is optional-value on one command cannot change parsing on another.
// Commands with DisableFlagParsing (vip wp) and everything after a `--`
// terminator are passed through verbatim, matching commander, which stops
// option processing at `--`.
func NormalizeOptionalValues(root *cobra.Command, argv []string) []string {
	target, _, err := root.Find(argv)
	if err != nil || target == nil || target.DisableFlagParsing {
		return argv
	}
	// Merge inherited persistent flags so an optional-value flag declared on a
	// parent is honored on the leaf.
	flags := target.Flags()
	flags.AddFlagSet(target.InheritedFlags())

	longs := map[string]*pflag.Flag{}
	shorts := map[string]*pflag.Flag{}
	flags.VisitAll(func(f *pflag.Flag) {
		if !isOptionalValue(f) {
			return
		}
		longs[f.Name] = f
		if f.Shorthand != "" {
			shorts[f.Shorthand] = f
		}
	})
	if len(longs) == 0 {
		return argv
	}

	out := make([]string, 0, len(argv))
	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		if arg == "--" {
			out = append(out, argv[i:]...)
			break
		}

		switch {
		case strings.HasPrefix(arg, "--") && !strings.Contains(arg, "="):
			if _, ok := longs[arg[2:]]; !ok {
				out = append(out, arg)
				continue
			}
		case len(arg) >= 2 && arg[0] == '-' && arg[1] != '-' && !strings.Contains(arg, "="):
			if _, ok := shorts[arg[1:2]]; !ok {
				out = append(out, arg)
				continue
			}
			// `-pn`: commander's _combineFlagAndOptionalValue treats the
			// remainder of the token as the value.
			if len(arg) > 2 {
				out = append(out, arg[:2]+"="+arg[2:])
				continue
			}
		default:
			out = append(out, arg)
			continue
		}

		if i+1 < len(argv) && !isOptionToken(argv[i+1]) {
			out = append(out, arg+"="+argv[i+1])
			i++
			continue
		}
		out = append(out, arg)
	}
	return out
}

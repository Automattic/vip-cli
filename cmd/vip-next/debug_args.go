package main

import (
	"strings"

	"github.com/spf13/cobra"
)

// Normalize debug's optional value before command discovery: otherwise Cobra
// can mistake a separated namespace for a subcommand. Stop at raw passthrough
// commands and --, and never consume the value of another flag.
func normalizeDebugValues(root *cobra.Command, argv []string) []string {
	target := root
	out := make([]string, 0, len(argv))
	child := func(name string) *cobra.Command {
		for _, c := range target.Commands() {
			if c.Name() == name || c.HasAlias(name) {
				return c
			}
		}
		return nil
	}
	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		if arg == "--" {
			return append(out, argv[i:]...)
		}
		if arg == "--debug" || arg == "-d" {
			if i+1 < len(argv) && (argv[i+1] == "-" || !strings.HasPrefix(argv[i+1], "-")) && child(argv[i+1]) == nil {
				i++
				arg += "=" + argv[i]
			}
			out = append(out, arg)
			continue
		}
		out = append(out, arg)
		if !strings.HasPrefix(arg, "-") {
			if c := child(arg); c != nil {
				target = c
				if c.DisableFlagParsing {
					return append(out, argv[i+1:]...)
				}
			}
			continue
		}
		if strings.Contains(arg, "=") {
			continue
		}
		flags := target.Flags()
		flags.AddFlagSet(target.InheritedFlags())
		flags.AddFlagSet(target.PersistentFlags())
		name := strings.TrimPrefix(arg, "--")
		flag := flags.Lookup(name)
		if len(arg) == 2 {
			flag = flags.ShorthandLookup(arg[1:])
		}
		if flag != nil && flag.NoOptDefVal == "" && i+1 < len(argv) {
			i++
			out = append(out, argv[i])
		}
	}
	return out
}

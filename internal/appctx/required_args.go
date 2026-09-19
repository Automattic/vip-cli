package appctx

import (
	"fmt"

	"github.com/spf13/cobra"
)

// WithRequiredArgs enforces an exact positional-arg count. On mismatch returns
// a Node-parity error: "Please supply N argument(s): <command usage>".
func WithRequiredArgs(n int) Middleware {
	return func(next RunFunc) RunFunc {
		return func(cmd *cobra.Command, args []string) error {
			if len(args) != n {
				word := "arguments"
				if n == 1 {
					word = "argument"
				}
				return fmt.Errorf("Please supply %d %s: %s", n, word, cmd.UseLine())
			}
			return next(cmd, args)
		}
	}
}

package appctx

import (
	"os"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

// IsInteractive reports whether prompts and browser opens are appropriate for
// the current invocation. Single source of truth for anything cobra drives; it
// replaced defensivemode.IsInteractive, since deleted along with the rest of an
// unused helper file. rechallenge.IsInteractiveContext survives as the fallback
// for the step-up middleware, which is built before any command is parsed and
// so has no *cobra.Command to read.
//
// Precedence:
//  1. VIP_NON_INTERACTIVE=1 -> false
//  2. --non-interactive flag (on cmd or any ancestor via PersistentFlags) -> false
//  3. stdin is a TTY -> true; otherwise false.
//
// The sensor is STDIN because that is the descriptor an answer has to arrive
// on. It used to be stdout, which meant `vip sync … | tee`, `> log` or `| less`
// reported "Command cancelled" and exited 0 with the mutation never issued
// (parity blocker B5). Node's enquirer reads stdin and is likewise unaffected
// by stdout redirection.
//
// This is deliberately NOT the same question as "can I render progress?" —
// that one is about where bytes are safe to draw and is sensed separately on
// os.Stderr (commands/progress_renderer.go, commands/sync.go), so that progress
// stays out of a redirected stdout and can never corrupt --format json.
func IsInteractive(cmd *cobra.Command) bool {
	return isInteractiveCheck(cmd, term.IsTerminal(int(os.Stdin.Fd())))
}

func isInteractiveCheck(cmd *cobra.Command, tty bool) bool {
	if os.Getenv("VIP_NON_INTERACTIVE") == "1" {
		return false
	}
	if cmd != nil {
		// cmd.Flag walks the local + persistent flag tables — covers ancestors
		// when PersistentFlags propagation has merged through ParseFlags. Read
		// the value off the *pflag.Flag directly (Flags().GetBool fails before
		// Cobra's lazy persistent-flag merge has run).
		if f := cmd.Flag("non-interactive"); f != nil && f.Changed && f.Value.String() == "true" {
			return false
		}
	}
	return tty
}

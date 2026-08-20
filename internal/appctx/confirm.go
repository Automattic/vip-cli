package appctx

import (
	"fmt"

	"github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/output"
)

// confirmPrompt is the seam the confirm middlewares call instead of Confirm
// directly, so tests can observe the exact prompt text (and answer it)
// without a TTY. Production value is Confirm.
var confirmPrompt = Confirm

// ConfirmPayload contributes module-specific rows to the confirmation info
// table and may rewrite the confirm message. It is the port of the
// `switch (_opts.module)` block in src/lib/cli/command.js:858-983.
//
// It runs BEFORE anything is printed, so returning an error aborts the
// command with nothing on screen — that is how Node's sync module refuses a
// sync the server would reject (command.js:914-920 calls exit.withError from
// inside the switch, before confirm() is ever reached).
//
// message is the current confirm message; the returned string replaces it
// (import-media rewrites "the URL" -> "the path" for local archives).
type ConfirmPayload func(cmd *cobra.Command, args []string, message string) ([]output.Tuple, string, error)

// ensureSkipConfirmationFlag registers --skip-confirmation on cmd's persistent
// flags. It is idempotent — if the flag already exists it is a no-op.
func ensureSkipConfirmationFlag(cmd *cobra.Command) {
	if cmd.Flag("skip-confirmation") != nil {
		return
	}
	// Register on PersistentFlags so subcommands inherit it, and also merge it
	// into the local FlagSet so cmd.Flags().Set/GetBool work in tests and when
	// Cobra hasn't yet performed its lazy persistent-flag merge.
	cmd.PersistentFlags().Bool("skip-confirmation", false, "Skip confirmation prompts.")
	cmd.Flags().AddFlagSet(cmd.PersistentFlags())
}

// WithSkipConfirmationFlag registers --skip-confirmation on cmd at apply time
// (so Cobra parses it before RunE) and returns a pass-through Middleware.
// Calling it on a cmd that already has the flag is a no-op.
func WithSkipConfirmationFlag(cmd *cobra.Command) Middleware {
	ensureSkipConfirmationFlag(cmd)
	return func(next RunFunc) RunFunc {
		return func(c *cobra.Command, args []string) error {
			return next(c, args)
		}
	}
}

// WithConfirm gates execution on a production-only yes/no prompt with the
// given static message. Non-production envs proceed without prompting.
// --skip-confirmation bypasses unconditionally. Decline (or non-interactive
// context) prints "Command cancelled" to stdout and returns nil (exit 0).
func WithConfirm(cmd *cobra.Command, message string) Middleware {
	ensureSkipConfirmationFlag(cmd)
	return func(next RunFunc) RunFunc {
		return func(c *cobra.Command, args []string) error {
			// --skip-confirmation bypasses unconditionally.
			if skip, _ := c.Flags().GetBool("skip-confirmation"); skip {
				return next(c, args)
			}

			// Production gate: only prompt on production envs.
			ae := FromContext(c.Context())
			if ae == nil || ae.Env.Type != "production" {
				return next(c, args)
			}

			// Prompt the user.
			confirmed, err := confirmPrompt(c, message, false)
			if err == ErrNonInteractive || (!confirmed && err == nil) {
				fmt.Fprintln(c.OutOrStdout(), "Command cancelled")
				return nil
			}
			if err != nil {
				return err
			}
			return next(c, args)
		}
	}
}

// WithRequireConfirm gates execution on an unconditional yes/no prompt
// (no production gating). --skip-confirmation bypasses. Decline (or
// non-interactive context) prints "Command cancelled" to stdout and returns
// nil (exit 0).
//
// Node parity (src/lib/cli/command.js:840-994 + src/lib/cli/prompt.ts:14):
// an info table listing the target App and Environment — plus any
// module-specific rows contributed by `payload` — is console.logged to
// STDOUT immediately above the yes/no question. Without it users were asked
// to authorize destroying a database without being told which one.
//
// The whole block, table included, lives behind `! options.force` in Node,
// so --skip-confirmation / --force renders nothing at all and never runs the
// payload. Do not "fix" that asymmetry: a table under --skip-confirmation
// would be output Node never produces.
func WithRequireConfirm(cmd *cobra.Command, message string, payload ...ConfirmPayload) Middleware {
	ensureSkipConfirmationFlag(cmd)
	return func(next RunFunc) RunFunc {
		return func(c *cobra.Command, args []string) error {
			// --skip-confirmation bypasses unconditionally.
			if skip, _ := c.Flags().GetBool("skip-confirmation"); skip {
				return next(c, args)
			}

			info := appEnvInfoRows(c)
			for _, p := range payload {
				if p == nil {
					continue
				}
				rows, rewritten, err := p(c, args, message)
				if err != nil {
					return err
				}
				info = append(info, rows...)
				message = rewritten
			}
			fmt.Fprintln(c.OutOrStdout(), output.KeyValue(info))

			// Prompt the user.
			confirmed, err := confirmPrompt(c, message, false)
			if err == ErrNonInteractive || (!confirmed && err == nil) {
				fmt.Fprintln(c.OutOrStdout(), "Command cancelled")
				return nil
			}
			if err != nil {
				return err
			}
			return next(c, args)
		}
	}
}

// appEnvInfoRows builds the two rows every requireConfirm command shows
// (command.js:844-851). Node guards each on `options.app` / `options.env`
// being set by the appContext/envContext middleware; the Go equivalent is a
// non-zero resolved ID on the AppEnv carrier.
func appEnvInfoRows(c *cobra.Command) []output.Tuple {
	ae := FromContext(c.Context())
	if ae == nil {
		return nil
	}
	var rows []output.Tuple
	if ae.App.ID != 0 {
		rows = append(rows, output.Tuple{
			Key:   "App",
			Value: fmt.Sprintf("%s (id: %d)", ae.App.Name, ae.App.ID),
		})
	}
	if ae.Env.ID != 0 {
		rows = append(rows, output.Tuple{
			Key:   "Environment",
			Value: fmt.Sprintf("%s (id: %d)", getEnvIdentifier(ae.Env), ae.Env.ID),
		})
	}
	return rows
}

// Secret prompts for a masked-input secret value. Returns ErrNonInteractive
// in non-interactive contexts.
//
// Intentional Node deviation: Node uses a plain Input prompt; Go masks input
// so envvar values do not appear in terminal scrollback. Parity scenarios for
// envvar set use --from-file + --skip-confirmation to bypass.
func Secret(cmd *cobra.Command, message string) (string, error) {
	if !IsInteractive(cmd) {
		return "", ErrNonInteractive
	}
	var out string
	if err := survey.AskOne(&survey.Password{Message: message}, &out); err != nil {
		return "", err
	}
	return out, nil
}

// Package envvar — reload-manifest UX helpers.
//
// These mirror Node's src/lib/envvar/input.ts surface:
//
//   - promptForReloadManifest(appTypeId): yes/no Confirm asking whether to
//     apply the envvar update now; prints a Node.js-specific build-vs-runtime
//     warning for typeIds {3, 5, 7, 8}.
//   - showDeployWarning(): yellow-bg "Important:" reminder printed after the
//     mutation when the user declined the reload (or didn't get prompted).
//
// Node parity callers: src/bin/vip-config-envvar-set.js and
// src/bin/vip-config-envvar-delete.js wire these into the success path.
package envvar

import (
	"fmt"
	"io"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
)

// NodeJsTypeIds mirrors src/lib/constants/vipgo.ts NODEJS_SITE_TYPE_IDS.
// Used to gate the Node.js-specific build-vs-runtime envvar warning.
var NodeJsTypeIds = map[int64]struct{}{3: {}, 5: {}, 7: {}, 8: {}}

// isAppNodejs reports whether typeId belongs to NODEJS_SITE_TYPE_IDS.
// typeId == 0 (unknown / not populated) is treated as not-Node.js.
func isAppNodejs(typeId int64) bool {
	_, ok := NodeJsTypeIds[typeId]
	return ok
}

// PromptForReloadManifest asks "Apply this environment variable update now?".
// Returns false (no prompt) on --skip-confirmation OR non-interactive.
// For Node.js apps, prefixes with the yellow build-vs-runtime warning.
//
// Node parity (src/lib/envvar/input.ts::promptForReloadManifest):
//   - The Confirm prompt itself uses `.catch(() => false)`, so any error
//     becomes "no". We mirror that: ErrNonInteractive (and any other prompt
//     failure) falls through to false instead of erroring the command.
func PromptForReloadManifest(cmd *cobra.Command, typeId int64, skipConfirmation bool) (bool, error) {
	if skipConfirmation {
		return false, nil
	}
	if !appctx.IsInteractive(cmd) {
		return false, nil
	}
	emitNodejsReloadWarning(cmd.OutOrStdout(), typeId)
	ok, err := appctx.Confirm(cmd, "Apply this environment variable update now?", false)
	if err != nil {
		// Node parity: any prompt failure (incl. ErrNonInteractive) falls
		// through as "no, don't reload" instead of erroring the command.
		return false, nil
	}
	return ok, nil
}

// emitNodejsReloadWarning prints the Node.js-specific build-vs-runtime
// notice. No-op for non-Node.js typeIds (or unknown typeId == 0).
//
// Node parity wording (input.ts):
//
//	⚠️ Note: Only applies to runtime variable changes. Build-time
//	environment variable changes won't take effect until your next deploy.
//
// The whole line is yellow; "Only applies to runtime variable changes."
// is additionally bolded.
func emitNodejsReloadWarning(stdout io.Writer, typeId int64) {
	if !isAppNodejs(typeId) {
		return
	}
	// Inner span is bold-only; outer YellowString already paints the whole
	// line yellow. Adding FgYellow inside would re-emit the yellow code
	// inside an already-yellow span (Node uses chalk.bold inside chalk.yellow).
	fmt.Fprintln(stdout, color.YellowString(
		"⚠️ Note: %s Build-time environment variable changes won't take effect until your next deploy.",
		color.New(color.Bold).Sprint("Only applies to runtime variable changes."),
	))
}

// ShowDeployWarning prints the post-mutation "won't be available until the
// next deploy" reminder. Called by set/delete on the success path when
// reloadManifest=false AND not --skip-confirmation. Mirrors Node's
// showDeployWarning() in src/lib/envvar/input.ts:
//
//	Important: This environment variable update will not be available
//	until the next code deploy is made to this environment.
//
// "Important:" is bold + yellow background; the rest is plain. Node uses
// chalk.bgYellow(chalk.bold(...)), which leaves the foreground to the
// terminal's default — we match that by NOT forcing FgBlack/FgWhite.
func ShowDeployWarning(stdout io.Writer) {
	fmt.Fprintf(stdout, "%s %s\n",
		color.New(color.BgYellow, color.Bold).Sprint("Important:"),
		"This environment variable update will not be available until the next code deploy is made to this environment.")
}

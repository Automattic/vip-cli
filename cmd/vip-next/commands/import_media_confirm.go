package commands

import (
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/output"
)

// importMediaConfirmPayload is the `case 'import-media'` arm of Node's
// requireConfirm switch (src/lib/cli/command.js:936-980).
//
// Row order, labels and value formatting are Node's verbatim — including the
// full-sentence key "Export any file errors encountered to a JSON file
// instead of a plain text file." and the trailing question mark on
// "Download file-error logs?".
//
// It also carries Node's message rewrite: when the input is a local archive
// rather than an http(s) URL, every occurrence of "the URL" in the confirm
// question becomes "the path" (command.js:944-947).
func importMediaConfirmPayload(cmd *cobra.Command, args []string, message string) ([]output.Tuple, string, error) {
	sub := ""
	if len(args) > 0 {
		sub = args[0]
	}
	isURL := sub != "" &&
		(strings.HasPrefix(sub, "http://") || strings.HasPrefix(sub, "https://"))

	archiveLabel := "Archive Path"
	if isURL {
		archiveLabel = "Archive URL"
	}
	if !isURL {
		message = strings.ReplaceAll(message, "the URL", "the path")
	}

	overwrite, _ := cmd.Flags().GetBool("overwriteExistingFiles")
	intermediate, _ := cmd.Flags().GetBool("importIntermediateImages")
	exportJSON, _ := cmd.Flags().GetBool("exportFileErrorsToJson")
	saveErrorLog, _ := cmd.Flags().GetString("saveErrorLog")

	rows := []output.Tuple{
		// chalk.blue.underline in Node; fatih/color drops the escapes under
		// NO_COLOR / non-TTY exactly as chalk does.
		{Key: archiveLabel, Value: color.New(color.FgBlue, color.Underline).Sprint(sub)},
		{Key: "Overwrite any existing files", Value: yesNoGlyph(overwrite)},
		{Key: "Import intermediate image files", Value: yesNoGlyph(intermediate)},
		{Key: "Export any file errors encountered to a JSON file instead of a plain text file.", Value: yesNoGlyph(exportJSON)},
		{Key: "Download file-error logs?", Value: negotiateSaveErrorLog(saveErrorLog)},
	}
	return rows, message, nil
}

// yesNoGlyph ports Node's ternary: ✅ Yes when on, chalk.red("x") + " No"
// when off (command.js:955).
func yesNoGlyph(v bool) string {
	if v {
		return "✅ Yes"
	}
	return color.RedString("x") + " No"
}

// negotiateSaveErrorLog ports the `_opts.module === 'import-media'` flag
// negotiation at src/lib/cli/command.js:829-837: the raw --saveErrorLog value
// collapses to exactly one of "true" / "false" / "prompt" before the handler
// (and the confirmation table) ever sees it. Anything unrecognized — including
// the flag being absent — becomes "prompt".
//
// This applies to `vip import media` only. `vip import media status` sets no
// module in Node and instead declares "prompt" as the option default, and
// `vip import media abort` passes no error-log options at all.
func negotiateSaveErrorLog(raw string) string {
	switch raw {
	case "true", "yes":
		return "true"
	case "false", "no":
		return "false"
	default:
		return "prompt"
	}
}

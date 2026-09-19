package appctx

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/output"
)

// RenderableRunFunc is the handler shape WithFormat wraps. Handlers return
// data (one of output.HeaderData | output.OrderedRows | output.Rows | nil)
// plus an error. WithFormat dispatches the data to output.Render with the
// validated format.
type RenderableRunFunc func(cmd *cobra.Command, args []string) (any, error)

type formatKey struct{}

// WithFormat adds the --format flag (default defaultFormat), validates against
// `allowed`, stashes the resolved format in cmd.Context() (read via
// FormatFromContext), and wraps the handler return through output.Render.
//
// cmd is the cobra.Command the flag should be registered on. --format is
// registered immediately at apply time (not lazily inside RunE) so cobra can
// parse it before the command runs.
//
// Use via Builder.WithRenderableRun so the (any, error) shape is preserved.
func WithFormat(cmd *cobra.Command, defaultFormat string, allowed ...string) func(RenderableRunFunc) RenderableRunFunc {
	allowedSet := make(map[string]bool, len(allowed))
	for _, a := range allowed {
		allowedSet[a] = true
	}
	// Register the flag immediately at apply time so cobra can parse it before
	// RunE is invoked. Previously this was done lazily inside the closure,
	// which caused "unknown flag: --format" errors at parse time.
	ensureFormatFlag(cmd, defaultFormat)
	return func(next RenderableRunFunc) RenderableRunFunc {
		return func(cmd *cobra.Command, args []string) (any, error) {
			f, _ := cmd.Flags().GetString("format")
			if f == "" {
				f = defaultFormat
			}
			if !allowedSet[f] {
				return nil, fmt.Errorf("Invalid format: %s. The supported formats are: %s.",
					f, strings.Join(allowed, ", "))
			}
			cmd.SetContext(context.WithValue(cmd.Context(), formatKey{}, output.Format(f)))
			data, err := next(cmd, args)
			if err != nil {
				return nil, err
			}
			return data, output.Render(cmd.OutOrStdout(), output.Format(f), data)
		}
	}
}

func ensureFormatFlag(cmd *cobra.Command, defaultFormat string) {
	if cmd.Flags().Lookup("format") == nil {
		cmd.Flags().String("format", defaultFormat,
			"Render output in a particular format.")
	}
}

// FormatFromContext returns the format resolved by WithFormat, or empty.
func FormatFromContext(ctx context.Context) output.Format {
	if v, ok := ctx.Value(formatKey{}).(output.Format); ok {
		return v
	}
	return ""
}

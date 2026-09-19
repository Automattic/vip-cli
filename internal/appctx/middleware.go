// Package appctx composes command middleware. In M2 the only middleware is
// WithTelemetry; later milestones add WithAppContext / WithEnvContext /
// WithFormat / WithConfirm. Spec §4.3.
package appctx

import "github.com/spf13/cobra"

type RunFunc func(cmd *cobra.Command, args []string) error

type Middleware func(next RunFunc) RunFunc

type Builder struct {
	cmd        *cobra.Command
	middleware []Middleware
}

func Build(cmd *cobra.Command, mw ...Middleware) *Builder {
	return &Builder{cmd: cmd, middleware: mw}
}

func (b *Builder) WithRun(base RunFunc) *cobra.Command {
	chain := base
	for i := len(b.middleware) - 1; i >= 0; i-- {
		chain = b.middleware[i](chain)
	}
	b.cmd.RunE = chain
	return b.cmd
}

// WithRenderableRun finalizes the builder for handlers that return (any, error).
// Use this when the chain includes WithFormat. Pure-error handlers use WithRun.
//
// The base RenderableRunFunc should ALREADY be wrapped with WithFormat (the
// innermost middleware closest to the handler) so output.Render runs against
// the data return. Builder's outer middleware slice receives a RunFunc
// adapter that discards the any return after rendering.
func (b *Builder) WithRenderableRun(base RenderableRunFunc) *cobra.Command {
	finalAsRun := RunFunc(func(cmd *cobra.Command, args []string) error {
		_, err := base(cmd, args)
		return err
	})
	return b.WithRun(finalAsRun)
}

// Chain composes middlewares left-to-right: Chain(a, b)(next) == a(b(next)).
// Useful when a handler needs multiple middlewares but they're not wrapped
// by a Builder.
func Chain(mw ...Middleware) Middleware {
	return func(next RunFunc) RunFunc {
		chain := next
		for i := len(mw) - 1; i >= 0; i-- {
			chain = mw[i](chain)
		}
		return chain
	}
}

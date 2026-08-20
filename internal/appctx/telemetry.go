package appctx

import "github.com/spf13/cobra"

type CommandTracker interface {
	MakeCommandTracker(command string, info map[string]any) func(eventType string, data map[string]any)
}

func WithTelemetry(tr CommandTracker, command string, info map[string]any) Middleware {
	track := tr.MakeCommandTracker(command, info)
	return func(next RunFunc) RunFunc {
		return func(cmd *cobra.Command, args []string) error {
			track("execute", nil)
			if err := next(cmd, args); err != nil {
				track("error", map[string]any{"error": err.Error()})
				return err
			}
			track("success", nil)
			return nil
		}
	}
}

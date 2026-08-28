package appctx

import (
	"errors"
	"testing"

	"github.com/spf13/cobra"
)

type fakeTracker struct {
	events []string
}

func (f *fakeTracker) MakeCommandTracker(cmd string, info map[string]any) func(string, map[string]any) {
	return func(eventType string, data map[string]any) {
		f.events = append(f.events, cmd+"_"+eventType)
	}
}

func TestWithTelemetryEmitsExecuteAndSuccess(t *testing.T) {
	tr := &fakeTracker{}
	cmd := &cobra.Command{Use: "demo"}
	wrapped := Build(cmd, WithTelemetry(tr, "demo", nil)).WithRun(func(cmd *cobra.Command, args []string) error { return nil })
	if err := wrapped.RunE(wrapped, nil); err != nil {
		t.Fatalf("RunE: %v", err)
	}
	if len(tr.events) != 2 || tr.events[0] != "demo_execute" || tr.events[1] != "demo_success" {
		t.Errorf("events = %v", tr.events)
	}
}

func TestWithTelemetryEmitsErrorOnFailure(t *testing.T) {
	tr := &fakeTracker{}
	cmd := &cobra.Command{Use: "demo"}
	wrapped := Build(cmd, WithTelemetry(tr, "demo", nil)).WithRun(func(cmd *cobra.Command, args []string) error {
		return errors.New("boom")
	})
	wrapped.RunE(wrapped, nil)
	if len(tr.events) != 2 || tr.events[1] != "demo_error" {
		t.Errorf("events = %v, want [execute, error]", tr.events)
	}
}

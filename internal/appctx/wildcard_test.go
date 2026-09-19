package appctx

import (
	"context"
	"testing"

	"github.com/spf13/cobra"
)

func TestWithWildcardCommandRoutesUnknownToFallback(t *testing.T) {
	parent := &cobra.Command{Use: "app"}
	knownSub := &cobra.Command{Use: "list", RunE: func(cmd *cobra.Command, args []string) error { return nil }}
	parent.AddCommand(knownSub)

	var calledWith []string
	WithWildcardCommand(parent, func(cmd *cobra.Command, args []string) error {
		calledWith = args
		return nil
	})

	parent.SetArgs([]string{"example-app"})
	parent.SetContext(context.Background())
	if err := parent.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(calledWith) != 1 || calledWith[0] != "example-app" {
		t.Errorf("fallback received args=%v, want [example-app]", calledWith)
	}
}

func TestWithWildcardCommandDispatchesKnownSubcommand(t *testing.T) {
	parent := &cobra.Command{Use: "app"}
	var listCalled bool
	knownSub := &cobra.Command{Use: "list", RunE: func(cmd *cobra.Command, args []string) error {
		listCalled = true
		return nil
	}}
	parent.AddCommand(knownSub)

	WithWildcardCommand(parent, func(cmd *cobra.Command, args []string) error {
		t.Error("fallback must not run when a real subcommand is invoked")
		return nil
	})

	parent.SetArgs([]string{"list"})
	parent.SetContext(context.Background())
	if err := parent.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if !listCalled {
		t.Error("list subcommand was not dispatched")
	}
}

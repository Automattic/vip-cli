package appctx

import (
	"testing"

	"github.com/spf13/cobra"
)

func TestMiddlewareChainExecutionOrder(t *testing.T) {
	var calls []string
	mw1 := func(next RunFunc) RunFunc {
		return func(cmd *cobra.Command, args []string) error {
			calls = append(calls, "mw1-before")
			err := next(cmd, args)
			calls = append(calls, "mw1-after")
			return err
		}
	}
	mw2 := func(next RunFunc) RunFunc {
		return func(cmd *cobra.Command, args []string) error {
			calls = append(calls, "mw2-before")
			err := next(cmd, args)
			calls = append(calls, "mw2-after")
			return err
		}
	}
	base := func(cmd *cobra.Command, args []string) error {
		calls = append(calls, "handler")
		return nil
	}
	cmd := &cobra.Command{Use: "test"}
	wrapped := Build(cmd, mw1, mw2).WithRun(base)
	if err := wrapped.RunE(wrapped, []string{}); err != nil {
		t.Fatalf("RunE: %v", err)
	}
	want := []string{"mw1-before", "mw2-before", "handler", "mw2-after", "mw1-after"}
	if !equalStrings(calls, want) {
		t.Errorf("calls = %v, want %v", calls, want)
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestChainComposesLeftToRight(t *testing.T) {
	var calls []string
	a := func(next RunFunc) RunFunc {
		return func(cmd *cobra.Command, args []string) error {
			calls = append(calls, "a-pre")
			err := next(cmd, args)
			calls = append(calls, "a-post")
			return err
		}
	}
	b := func(next RunFunc) RunFunc {
		return func(cmd *cobra.Command, args []string) error {
			calls = append(calls, "b-pre")
			err := next(cmd, args)
			calls = append(calls, "b-post")
			return err
		}
	}
	core := func(cmd *cobra.Command, args []string) error {
		calls = append(calls, "core")
		return nil
	}
	if err := Chain(a, b)(core)(&cobra.Command{}, nil); err != nil {
		t.Fatalf("err: %v", err)
	}
	want := []string{"a-pre", "b-pre", "core", "b-post", "a-post"}
	if len(calls) != len(want) {
		t.Fatalf("len(calls) = %d, want %d (calls=%v)", len(calls), len(want), calls)
	}
	for i := range want {
		if calls[i] != want[i] {
			t.Errorf("calls[%d] = %q, want %q", i, calls[i], want[i])
		}
	}
}

package appctx

import (
	"context"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestWithRequiredArgsAccepts(t *testing.T) {
	cmd := &cobra.Command{Use: "get <NAME>"}
	cmd.SetContext(context.Background())
	mw := WithRequiredArgs(1)
	run := mw(func(cmd *cobra.Command, args []string) error {
		if len(args) != 1 || args[0] != "FOO" {
			t.Errorf("args = %v", args)
		}
		return nil
	})
	if err := run(cmd, []string{"FOO"}); err != nil {
		t.Fatalf("run: %v", err)
	}
}

func TestWithRequiredArgsRejects(t *testing.T) {
	cmd := &cobra.Command{Use: "get <NAME>"}
	cmd.SetContext(context.Background())
	mw := WithRequiredArgs(1)
	run := mw(func(cmd *cobra.Command, args []string) error {
		t.Error("handler must not run when arg count is wrong")
		return nil
	})
	err := run(cmd, []string{})
	if err == nil || !strings.Contains(err.Error(), "Please supply 1 argument") {
		t.Errorf("err = %v, want Node-parity supply-argument error", err)
	}
}

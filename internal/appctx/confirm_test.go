package appctx

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestWithSkipConfirmationFlagRegistersAtApplyTime(t *testing.T) {
	cmd := &cobra.Command{Use: "x"}
	_ = WithSkipConfirmationFlag(cmd)
	if cmd.Flag("skip-confirmation") == nil {
		t.Fatal("--skip-confirmation must be registered at apply time so Cobra parses it before RunE")
	}
	// Idempotent: applying again on the same cmd must not panic / double-register.
	_ = WithSkipConfirmationFlag(cmd)
}

func TestWithConfirmSkipsPromptWhenSkipFlagSet(t *testing.T) {
	cmd := &cobra.Command{Use: "x"}
	mw := WithConfirm(cmd, "Are you sure?")
	cmd.SetContext(WithAppEnv(context.Background(), &AppEnv{
		App: App{ID: 1, Name: "myapp"},
		Env: Env{ID: 2, Type: "production"},
	}))
	_ = cmd.Flags().Set("skip-confirmation", "true")
	called := false
	if err := mw(func(*cobra.Command, []string) error { called = true; return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !called {
		t.Error("handler must run when --skip-confirmation is set (no prompt)")
	}
}

func TestWithConfirmSkipsNonProduction(t *testing.T) {
	cmd := &cobra.Command{Use: "x"}
	mw := WithConfirm(cmd, "Are you sure?")
	cmd.SetContext(WithAppEnv(context.Background(), &AppEnv{
		App: App{ID: 1, Name: "myapp"},
		Env: Env{ID: 2, Type: "develop"},
	}))
	called := false
	if err := mw(func(*cobra.Command, []string) error { called = true; return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !called {
		t.Error("non-production envs must skip the confirm prompt")
	}
}

func TestWithConfirmProdNonInteractiveCancels(t *testing.T) {
	// VIP_NON_INTERACTIVE=1 makes IsInteractive return false; Confirm
	// returns ErrNonInteractive; the middleware treats that as decline,
	// prints "Command cancelled" to stdout, returns nil (exit 0 — user-cancel != error).
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	cmd := &cobra.Command{Use: "x"}
	mw := WithConfirm(cmd, "Are you sure?")
	cmd.SetContext(WithAppEnv(context.Background(), &AppEnv{
		App: App{ID: 1, Name: "myapp"},
		Env: Env{ID: 2, Type: "production"},
	}))
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	called := false
	if err := mw(func(*cobra.Command, []string) error { called = true; return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if called {
		t.Error("non-interactive prod confirm should cancel without invoking handler")
	}
	if !strings.Contains(stdout.String(), "Command cancelled") {
		t.Errorf("stdout must contain 'Command cancelled'; got %q", stdout.String())
	}
}

func TestWithRequireConfirmSkipsPromptWhenSkipFlagSet(t *testing.T) {
	cmd := &cobra.Command{Use: "x"}
	mw := WithRequireConfirm(cmd, "Are you sure you want to do the thing?")
	cmd.SetContext(context.Background())
	_ = cmd.Flags().Set("skip-confirmation", "true")
	called := false
	if err := mw(func(*cobra.Command, []string) error { called = true; return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !called {
		t.Error("handler must run when --skip-confirmation is set")
	}
}

func TestWithRequireConfirmNonInteractiveCancels(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	cmd := &cobra.Command{Use: "x"}
	mw := WithRequireConfirm(cmd, "Are you sure?")
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	called := false
	if err := mw(func(*cobra.Command, []string) error { called = true; return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if called {
		t.Error("non-interactive WithRequireConfirm should cancel without invoking handler")
	}
	if !strings.Contains(stdout.String(), "Command cancelled") {
		t.Errorf("stdout must contain 'Command cancelled'; got %q", stdout.String())
	}
}

func TestSecretNonInteractiveReturnsErr(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	cmd := &cobra.Command{Use: "x"}
	_, err := Secret(cmd, "Enter the value:")
	if !errors.Is(err, ErrNonInteractive) {
		t.Errorf("err = %v, want ErrNonInteractive", err)
	}
}

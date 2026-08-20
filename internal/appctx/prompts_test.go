package appctx

import (
	"bytes"
	"errors"
	"testing"

	"github.com/spf13/cobra"
)

// makeNonInteractiveCmd builds a cobra command with --non-interactive=true
// set via PersistentFlags (the bucket the flag was defined on — see Task 6
// for why this matters in pre-Execute test scenarios).
func makeNonInteractiveCmd(t *testing.T) *cobra.Command {
	t.Helper()
	cmd := &cobra.Command{Use: "x"}
	cmd.PersistentFlags().Bool("non-interactive", false, "")
	if err := cmd.PersistentFlags().Set("non-interactive", "true"); err != nil {
		t.Fatalf("set --non-interactive: %v", err)
	}
	return cmd
}

func TestConfirmNonInteractiveReturnsErr(t *testing.T) {
	cmd := makeNonInteractiveCmd(t)
	got, err := Confirm(cmd, "delete the world?", false)
	if !errors.Is(err, ErrNonInteractive) {
		t.Errorf("err = %v, want ErrNonInteractive", err)
	}
	if got != false {
		t.Errorf("got = %v, want false", got)
	}
}

func TestInputNonInteractiveErrorsWithoutDefault(t *testing.T) {
	cmd := makeNonInteractiveCmd(t)
	got, err := Input(cmd, "value?", "")
	if !errors.Is(err, ErrNonInteractive) {
		t.Errorf("err = %v, want ErrNonInteractive", err)
	}
	if got != "" {
		t.Errorf("got = %q, want empty", got)
	}
}

func TestInputNonInteractiveAllowsDefault(t *testing.T) {
	cmd := makeNonInteractiveCmd(t)
	got, err := Input(cmd, "value?", "fallback")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "fallback" {
		t.Errorf("Input = %q, want fallback", got)
	}
}

func TestSelectNonInteractiveReturnsFirst(t *testing.T) {
	cmd := makeNonInteractiveCmd(t)
	got, err := Select(cmd, "pick:", []string{"a", "b", "c"})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "a" {
		t.Errorf("Select = %q, want a", got)
	}
}

func TestSelectNonInteractiveEmptyOptionsErr(t *testing.T) {
	cmd := makeNonInteractiveCmd(t)
	got, err := Select(cmd, "pick:", nil)
	if !errors.Is(err, ErrNonInteractive) {
		t.Errorf("err = %v, want ErrNonInteractive", err)
	}
	if got != "" {
		t.Errorf("got = %q, want empty", got)
	}
}

// confirmCore must print to the provided writer in non-interactive mode and
// return ErrNonInteractive. This pins the contract that the wrapper warns
// the operator before failing.
func TestConfirmCoreNonInteractiveWritesStderr(t *testing.T) {
	var stderr bytes.Buffer
	got, err := confirmCore(false /*interactive*/, &stderr, "test message", true)
	if got != false {
		t.Errorf("got = %v, want false", got)
	}
	if !errors.Is(err, ErrNonInteractive) {
		t.Errorf("err = %v, want ErrNonInteractive", err)
	}
	if stderr.Len() == 0 {
		t.Error("confirmCore non-interactive must write something to stderr")
	}
	if !bytes.Contains(stderr.Bytes(), []byte("test message")) {
		t.Errorf("stderr = %q, want it to include the prompt message", stderr.String())
	}
}

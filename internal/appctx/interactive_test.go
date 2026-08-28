package appctx

import (
	"os"
	"testing"

	"github.com/creack/pty"
	"github.com/spf13/cobra"
)

// swapStdio points os.Stdin/os.Stdout at the given files for the duration of
// the test. The existing isInteractiveCheck tests inject the tty bool, so they
// pass no matter WHICH descriptor the real IsInteractive senses — these two
// tests pin that down.
func swapStdio(t *testing.T, in, out *os.File) {
	t.Helper()
	origIn, origOut := os.Stdin, os.Stdout
	os.Stdin, os.Stdout = in, out
	t.Cleanup(func() { os.Stdin, os.Stdout = origIn, origOut })
}

func openPTY(t *testing.T) *os.File {
	t.Helper()
	ptmx, tty, err := pty.Open()
	if err != nil {
		t.Skipf("pty unavailable: %v", err)
	}
	t.Cleanup(func() { _ = ptmx.Close(); _ = tty.Close() })
	return tty
}

func regularFile(t *testing.T) *os.File {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "redirected")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = f.Close() })
	return f
}

func interactiveTestCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "x"}
	cmd.PersistentFlags().Bool("non-interactive", false, "")
	return cmd
}

// Regression for parity blocker B5. Interactivity was sensed on os.Stdout, so
// `vip sync … > log`, `| tee` or `| less` printed "Command cancelled" and exited
// 0 with the mutation never issued — the user believed the sync had run. Node's
// enquirer reads stdin and is unaffected by stdout redirection.
func TestIsInteractiveSensesStdinNotStdout(t *testing.T) {
	swapStdio(t, openPTY(t), regularFile(t))
	if !IsInteractive(interactiveTestCmd()) {
		t.Error("stdin is a TTY and only stdout is redirected: prompting must still be possible")
	}
}

// The converse: a piped stdin cannot answer a prompt, even when stdout is a
// terminal (`vip sync < /dev/null` must not block waiting for an answer).
func TestIsInteractiveFalseWhenStdinIsNotATTY(t *testing.T) {
	swapStdio(t, regularFile(t), openPTY(t))
	if IsInteractive(interactiveTestCmd()) {
		t.Error("stdin is not a TTY: prompting is impossible regardless of stdout")
	}
}

func TestIsInteractiveDefaults(t *testing.T) {
	cmd := &cobra.Command{Use: "x"}
	cmd.PersistentFlags().Bool("non-interactive", false, "")
	if got := isInteractiveCheck(cmd, true); !got {
		t.Errorf("interactive in a TTY with no overrides should be true, got %v", got)
	}
	if got := isInteractiveCheck(cmd, false); got {
		t.Errorf("non-TTY should be false")
	}
}

func TestIsInteractiveHonorsFlag(t *testing.T) {
	cmd := &cobra.Command{Use: "x"}
	cmd.PersistentFlags().Bool("non-interactive", false, "")
	// Set via the PersistentFlags bucket the flag was defined on. Cobra only
	// merges persistent flags into the local Flags() set lazily (during
	// ParseFlags/Execute), so a direct Flags().Set on a never-executed command
	// would fail. By real-command-execution time the merge has happened and
	// cmd.Flag("non-interactive") finds it regardless.
	if err := cmd.PersistentFlags().Set("non-interactive", "true"); err != nil {
		t.Fatalf("flag set: %v", err)
	}
	if isInteractiveCheck(cmd, true) {
		t.Error("--non-interactive must disable interactivity even on TTY")
	}
}

func TestIsInteractiveHonorsEnv(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	cmd := &cobra.Command{Use: "x"}
	cmd.PersistentFlags().Bool("non-interactive", false, "")
	if isInteractiveCheck(cmd, true) {
		t.Error("VIP_NON_INTERACTIVE=1 must disable interactivity")
	}
}

// PersistentFlags propagation: a flag defined on parent must be honored when
// the test passes the child command in. (Cobra resolves PersistentFlags
// through cmd.Flag() on subcommands; this test pins the contract that the
// implementation walks the command tree correctly.)
func TestIsInteractiveHonorsPersistentFlagOnParent(t *testing.T) {
	parent := &cobra.Command{Use: "parent"}
	parent.PersistentFlags().Bool("non-interactive", false, "")
	child := &cobra.Command{Use: "child"}
	parent.AddCommand(child)
	// Cobra normally executes the full command tree (which propagates flags);
	// in unit tests we trigger the merge by calling Execute or ParseFlags.
	parent.SetArgs([]string{"child", "--non-interactive=true"})
	if err := parent.Execute(); err != nil {
		// child has no RunE — Execute returns the "no RunE" error or similar;
		// that's fine, we only need the flag-parsing side-effect.
		_ = err
	}
	if isInteractiveCheck(child, true) {
		t.Error("--non-interactive defined on parent (PersistentFlags) must disable interactivity for child")
	}
}

func TestIsInteractiveNilCmd(t *testing.T) {
	// Defensive: a nil cobra command shouldn't panic; treat as if no flag is set.
	if got := isInteractiveCheck(nil, true); !got {
		t.Errorf("nil cmd + TTY should default to interactive=true, got %v", got)
	}
	if got := isInteractiveCheck(nil, false); got {
		t.Errorf("nil cmd + non-TTY should be false, got %v", got)
	}
}

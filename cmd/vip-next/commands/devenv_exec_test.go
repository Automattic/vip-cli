package commands

import (
	"testing"

	"github.com/spf13/cobra"
)

func TestArgsAfterDashes(t *testing.T) {
	// Build a command and parse args containing a `--` terminator.
	c := &cobra.Command{Use: "exec", RunE: func(*cobra.Command, []string) error { return nil }}
	c.Flags().String("slug", "", "")
	if err := c.ParseFlags([]string{"--slug", "x", "--", "wp", "post", "list"}); err != nil {
		t.Fatal(err)
	}
	// After ParseFlags, c.Flags().Args() holds the positional args and
	// ArgsLenAtDash marks the `--` split. Simulate cobra's RunE args.
	args := c.Flags().Args()
	got := argsAfterDashes(c, args)
	want := []string{"wp", "post", "list"}
	if len(got) != len(want) {
		t.Fatalf("argsAfterDashes = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("argsAfterDashes[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestArgsAfterDashesNoDash(t *testing.T) {
	c := &cobra.Command{Use: "exec"}
	if err := c.ParseFlags([]string{"foo", "bar"}); err != nil {
		t.Fatal(err)
	}
	if got := argsAfterDashes(c, c.Flags().Args()); got != nil {
		t.Fatalf("argsAfterDashes without `--` should be nil, got %v", got)
	}
}

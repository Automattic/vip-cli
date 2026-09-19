package commands

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

type fixedFrame string

func (f fixedFrame) Frame() string { return string(f) }

func TestBackupTTYProgressAndSuccessShareStdout(t *testing.T) {
	cmd := &cobra.Command{}
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)

	renderer := startProgressRenderer(cmd, fixedFrame("✓ Generating backup \n"), cmd.OutOrStdout(), true)
	renderer.stopCompact(cmd, true)
	fmt.Fprintln(cmd.OutOrStdout(), "New database backup created")

	if got := stdout.String(); !strings.Contains(got, "✓ Generating backup \nNew database backup created\n") {
		t.Fatalf("TTY progress and success must be ordered on stdout; got %q", got)
	}
}

package commands

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/Automattic/vip/internal/update"
)

type UpdateRunner interface {
	Run(context.Context, update.Request, func(update.Step)) (update.Outcome, error)
}

func NewUpdateCmd(runner UpdateRunner) *cobra.Command {
	var check bool
	var channel string
	cmd := &cobra.Command{Use: "update", Short: "Check for or install a newer standalone Go CLI release", Args: cobra.NoArgs, Example: "  vip-next update\n  vip-next update --check\n  vip-next update --channel preview\n  vip-next update --channel stable"}
	cmd.Flags().BoolVar(&check, "check", false, "Check for an update without installing it")
	cmd.Flags().StringVar(&channel, "channel", "", "Select and remember the stable or preview release channel")
	cmd.RunE = func(cmd *cobra.Command, _ []string) error {
		explicit := cmd.Flags().Changed("channel")
		if explicit && channel != "stable" && channel != "preview" {
			return fmt.Errorf("channel must be stable or preview")
		}
		stderr := cmd.ErrOrStderr()
		interactive := false
		if f, ok := stderr.(*os.File); ok {
			interactive = term.IsTerminal(int(f.Fd()))
		}
		open := ""
		progress := func(s update.Step) {
			if s.Done {
				if open != s.Name {
					fmt.Fprintf(stderr, "%s… ", s.Name)
				}
				if interactive {
					fmt.Fprintln(stderr, "✓")
				} else {
					fmt.Fprintln(stderr, "done")
				}
				open = ""
			} else {
				fmt.Fprintf(stderr, "%s… ", s.Name)
				open = s.Name
			}
		}
		out, err := runner.Run(cmd.Context(), update.Request{CheckOnly: check, Channel: update.Channel(channel), ExplicitChannel: explicit}, progress)
		if open != "" {
			fmt.Fprintln(stderr, "failed")
		}
		if err != nil {
			return err
		}
		for _, warning := range out.Warnings {
			fmt.Fprintln(stderr, warning)
		}
		return writeUpdateOutcome(cmd.OutOrStdout(), out)
	}
	return cmd
}
func writeUpdateOutcome(w io.Writer, out update.Outcome) error {
	switch {
	case out.Instructions != "":
		_, err := fmt.Fprintln(w, out.Instructions)
		return err
	case out.Updated:
		_, err := fmt.Fprintf(w, "Updated to %s\n", out.Available)
		return err
	case out.Available != "":
		_, err := fmt.Fprintf(w, "Installed: %s\nChannel: %s\nAvailable: %s\nRun vip-next update to install.\n", out.Installed, out.Channel, out.Available)
		return err
	case out.Channel == update.Stable && strings.Contains(out.Installed, "-"):
		_, err := fmt.Fprintf(w, "Installed: %s\nChannel: stable\nNo newer stable release is available; waiting for stable to catch up.\n", out.Installed)
		return err
	default:
		_, err := fmt.Fprintf(w, "Already up to date: %s (channel: %s)\n", out.Installed, out.Channel)
		return err
	}
}

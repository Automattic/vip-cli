package commands

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/creack/pty"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/update"
)

type updateRunnerFunc func(context.Context, update.Request, func(update.Step)) (update.Outcome, error)

func (f updateRunnerFunc) Run(c context.Context, r update.Request, p func(update.Step)) (update.Outcome, error) {
	return f(c, r, p)
}
func TestUpdateCheckAndInvalidArguments(t *testing.T) {
	called := 0
	runner := updateRunnerFunc(func(_ context.Context, r update.Request, _ func(update.Step)) (update.Outcome, error) {
		called++
		if !r.CheckOnly || !r.ExplicitChannel || r.Channel != update.Preview {
			t.Fatal(r)
		}
		return update.Outcome{Installed: "5.0.0", Available: "5.1.0-beta.1", Channel: update.Preview}, nil
	})
	cmd := NewUpdateCmd(runner)
	var out, stderr bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetErr(&stderr)
	cmd.SetArgs([]string{"--check", "--channel", "preview"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if called != 1 || !strings.Contains(out.String(), "5.1.0-beta.1") || stderr.Len() != 0 {
		t.Fatal(called, out.String(), stderr.String())
	}
	for _, args := range [][]string{{"--channel", "invalid"}, {"--channel="}, {"unexpected"}, {"--bogus"}} {
		cmd = NewUpdateCmd(runner)
		cmd.SetOut(&out)
		cmd.SetErr(&stderr)
		cmd.SetArgs(args)
		if err := cmd.Execute(); err == nil {
			t.Fatal("accepted", args)
		}
	}
	if called != 1 {
		t.Fatal("invalid arguments reached updater")
	}
}

func TestUpdateManagedInstallationReportsVersions(t *testing.T) {
	var out bytes.Buffer
	result := update.Outcome{Installed: "5.0.0", Available: "5.0.1", Channel: update.Stable, Instructions: "Installer opened. Follow its prompts to finish upgrading."}
	if err := writeUpdateOutcome(&out, result); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Installed: 5.0.0", "Available: 5.0.1", "Channel: stable", result.Instructions} {
		if !strings.Contains(out.String(), want) {
			t.Fatalf("missing %q in %s", want, out.String())
		}
	}
	if strings.Contains(out.String(), "Updated to") {
		t.Fatal("handoff reported as completed installation")
	}
}

func TestUpdateInstallerInteractivity(t *testing.T) {
	ptmx, tty, err := pty.Open()
	if err != nil {
		t.Skipf("pty unavailable: %v", err)
	}
	defer ptmx.Close()
	defer tty.Close()
	original := os.Stdin
	os.Stdin = tty
	defer func() { os.Stdin = original }()
	t.Setenv("VIP_NON_INTERACTIVE", "")
	// The shared appctx tests cover the policy matrix; retain the update command's
	// wiring and its explicit non-interactive override on a real terminal.
	for _, nonInteractive := range []bool{false, true} {
		cmd := NewUpdateCmd(updateRunnerFunc(func(_ context.Context, r update.Request, _ func(update.Step)) (update.Outcome, error) {
			if r.Interactive == nonInteractive {
				t.Fatalf("incorrect installer interactivity: %+v", r)
			}
			return update.Outcome{}, nil
		}))
		root := &cobra.Command{Use: "vip-next"}
		root.PersistentFlags().Bool("non-interactive", false, "")
		root.AddCommand(cmd)
		root.SetOut(io.Discard)
		root.SetArgs([]string{"update", fmt.Sprintf("--non-interactive=%t", nonInteractive)})
		if err := root.Execute(); err != nil {
			t.Fatal(err)
		}
	}
}

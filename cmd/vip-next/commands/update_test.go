package commands

import (
	"bytes"
	"context"
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
	cmd := NewUpdateCmd(updateRunnerFunc(func(context.Context, update.Request, func(update.Step)) (update.Outcome, error) {
		return update.Outcome{Installed: "5.0.0", Available: "5.0.1", Channel: update.Stable, Instructions: "Download and run: https://github.com/Automattic/vip-cli/releases/download/5.0.1/vip-next-darwin-arm64.pkg"}, nil
	}))
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetArgs(nil)
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Installed: 5.0.0", "Available: 5.0.1", "Channel: stable", "/download/5.0.1/vip-next-darwin-arm64.pkg"} {
		if !strings.Contains(out.String(), want) {
			t.Fatalf("missing %q in %s", want, out.String())
		}
	}
	if strings.Contains(out.String(), "Updated to") {
		t.Fatal("manual handoff reported as completed installation")
	}
}

func TestUpdateInstallerInteractivity(t *testing.T) {
	ptmx, tty, err := pty.Open()
	if err != nil {
		t.Skipf("pty unavailable: %v", err)
	}
	defer ptmx.Close()
	defer tty.Close()
	input, err := os.CreateTemp(t.TempDir(), "input")
	if err != nil {
		t.Fatal(err)
	}
	defer input.Close()
	original := os.Stdin
	defer func() { os.Stdin = original }()
	for _, tc := range []struct {
		name  string
		stdin *os.File
		args  []string
		env   string
		want  bool
	}{
		{"terminal", tty, nil, "", true},
		{"explicit flag", tty, []string{"--non-interactive"}, "", false},
		{"environment", tty, nil, "1", false},
		{"piped stdin", input, nil, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			os.Stdin = tc.stdin
			t.Setenv("VIP_NON_INTERACTIVE", tc.env)
			cmd := NewUpdateCmd(updateRunnerFunc(func(_ context.Context, r update.Request, _ func(update.Step)) (update.Outcome, error) {
				if r.Interactive != tc.want {
					t.Fatalf("installer interactivity: got %v, want %v", r.Interactive, tc.want)
				}
				return update.Outcome{Installed: "5.0.0", Channel: update.Stable}, nil
			}))
			root := &cobra.Command{Use: "vip-next"}
			root.PersistentFlags().Bool("non-interactive", false, "")
			root.AddCommand(cmd)
			root.SetOut(io.Discard)
			root.SetArgs(append([]string{"update"}, tc.args...))
			if err := root.Execute(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

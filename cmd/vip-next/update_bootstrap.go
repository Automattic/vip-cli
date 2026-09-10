package main

import (
	"fmt"
	"os"
	"sync"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/update"
)

func isUpdateInvocation(root *cobra.Command, prepared []string) bool {
	for i, arg := range prepared {
		if arg == "--" {
			prepared = prepared[:i]
			break
		}
	}
	cmd, _, err := root.Find(prepared)
	return err == nil && cmd.Parent() == root && cmd.Name() == "update"
}
func installUpdateNotifier(root *cobra.Command, start func(*cobra.Command) func()) func() {
	if start == nil {
		return func() {}
	}
	var finish func()
	var wrap func(*cobra.Command)
	wrap = func(cmd *cobra.Command) {
		if old := cmd.RunE; old != nil {
			cmd.RunE = func(c *cobra.Command, a []string) error { finish = start(c); return old(c, a) }
		} else if old := cmd.Run; old != nil {
			cmd.Run = func(c *cobra.Command, a []string) { finish = start(c); old(c, a) }
		}
		for _, child := range cmd.Commands() {
			wrap(child)
		}
	}
	wrap(root)
	var once sync.Once
	return func() {
		once.Do(func() {
			if finish != nil {
				finish()
			}
		})
	}
}
func startUpdateNotice(cmd *cobra.Command) func() {
	if !updateNoticeAllowed(cmd, appctx.IsInteractive(cmd), stderrTerminal(cmd), os.Getenv) {
		return nil
	}
	service := update.NewService()
	n := update.Notifier{State: service.State, Installed: service.Installed, Platform: service.Platform, Now: service.Now, Fetch: service.Fetch}
	finish := n.Start(cmd.Context())
	return func() {
		if notice := finish(); notice != nil {
			fmt.Fprintf(cmd.ErrOrStderr(), "A newer vip-next release is available: %s. Run vip-next update to install.\n", notice.Version)
		}
	}
}
func stderrTerminal(cmd *cobra.Command) bool {
	f, ok := cmd.ErrOrStderr().(*os.File)
	return ok && term.IsTerminal(int(f.Fd()))
}
func updateNoticeAllowed(cmd *cobra.Command, interactive, stderrTTY bool, getenv func(string) string) bool {
	if !interactive || !stderrTTY || cmd.Parent() == nil {
		return false
	}
	for _, key := range []string{"CI", "GITHUB_ACTIONS", "BUILDKITE"} {
		if v := getenv(key); v != "" && v != "false" && v != "0" {
			return false
		}
	}
	if getenv("GO_ENV") == "test" || getenv("NODE_ENV") == "test" || getenv("VIP_NO_UPDATE_NOTIFIER") == "1" {
		return false
	}
	for c := cmd; c != nil; c = c.Parent() {
		if c.Name() == "update" && c.Parent() == cmd.Root() || c.Name() == "help" || c.Name() == "completion" || c.Name() == "wp" {
			return false
		}
	}
	if f := cmd.Flag("format"); f != nil && (f.Value.String() == "json" || f.Value.String() == "csv") {
		return false
	}
	for _, name := range []string{"help", "version"} {
		if f := cmd.Flag(name); f != nil && f.Value.String() == "true" {
			return false
		}
	}
	return true
}

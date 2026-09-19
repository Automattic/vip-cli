package main

import (
	"context"
	"testing"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/update"
)

type updateRunnerFunc func(context.Context, update.Request, func(update.Step)) (update.Outcome, error)

func (f updateRunnerFunc) Run(c context.Context, r update.Request, p func(update.Step)) (update.Outcome, error) {
	return f(c, r, p)
}
func TestIsUpdateInvocation(t *testing.T) {
	for _, tc := range []struct {
		args []string
		want bool
	}{{[]string{"update", "--check"}, true}, {[]string{"--debug=update", "update", "--check"}, true}, {[]string{"--app", "update", "whoami"}, false}, {[]string{"config", "software", "update"}, false}, {[]string{"wp", "plugin", "update"}, false}, {[]string{"--", "update"}, false}, {[]string{"whoami", "update"}, false}} {
		root := newRootCmd(&rootContext{})
		if got := isUpdateInvocation(root, prepareArgs(root, tc.args)); got != tc.want {
			t.Errorf("%q: got %v", tc.args, got)
		}
	}
}
func TestUpdateBypassesCredentialConstruction(t *testing.T) {
	ran := false
	deps := runDeps{NewKeychain: func(string) *keychain.Keychain { t.Fatal("update constructed credential store"); return nil }, NewLogin: func(*auth.Store) func() (*auth.Token, error) { t.Fatal("update requested login"); return nil }, UpdateRunner: updateRunnerFunc(func(_ context.Context, r update.Request, _ func(update.Step)) (update.Outcome, error) {
		ran = true
		return update.Outcome{Installed: "5.0.0", Channel: update.Stable}, nil
	})}
	if err := runWithDeps([]string{"update", "--check"}, deps); err != nil || !ran {
		t.Fatal(err, ran)
	}
	ran = false
	if err := runWithDeps([]string{"update", "--badflag"}, deps); err == nil || ran {
		t.Fatal("invalid update dispatched", err, ran)
	}
}

func TestUpdateNotificationGates(t *testing.T) {
	root := newRootCmd(&rootContext{})
	leaf, _, err := root.Find([]string{"whoami"})
	if err != nil {
		t.Fatal(err)
	}
	empty := func(string) string { return "" }
	if !updateNoticeAllowed(leaf, true, true, empty) {
		t.Fatal("interactive command suppressed")
	}
	for _, key := range []string{"CI", "GITHUB_ACTIONS", "BUILDKITE", "GO_ENV", "NODE_ENV", "VIP_NO_UPDATE_NOTIFIER"} {
		get := func(k string) string {
			if k != key {
				return ""
			}
			if key == "GO_ENV" || key == "NODE_ENV" {
				return "test"
			}
			return "1"
		}
		if updateNoticeAllowed(leaf, true, true, get) {
			t.Error("not suppressed", key)
		}
	}
	if updateNoticeAllowed(leaf, false, true, empty) || updateNoticeAllowed(leaf, true, false, empty) {
		t.Fatal("nonterminal notice")
	}
	for _, argv := range [][]string{{"update"}, {"wp"}, {"logs"}} {
		r := newRootCmd(&rootContext{})
		c, _, e := r.Find(argv)
		if e != nil {
			t.Fatal(e)
		}
		if argv[0] == "logs" {
			if e = c.ParseFlags([]string{"--format=json"}); e != nil {
				t.Fatal(e)
			}
		}
		if updateNoticeAllowed(c, true, true, empty) {
			t.Fatal("unsafe output notice", argv)
		}
	}
}

package commands

import (
	"bytes"
	"context"
	"strings"
	"testing"

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

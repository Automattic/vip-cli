package commands

import (
	"errors"
	"testing"

	"github.com/Automattic/vip/internal/auth"
)

func TestLoginCmdSwallowsHandledErrors(t *testing.T) {
	for _, err := range []error{auth.ErrLoginCancelled, auth.ErrTokenExpired, auth.ErrTokenInvalid} {
		if !(errors.Is(err, auth.ErrLoginCancelled) || auth.IsHandledLoginError(err)) {
			t.Errorf("%v should be treated as a clean exit", err)
		}
	}
}

func TestTrackerAdapterForwards(t *testing.T) {
	var got string
	a := trackerAdapter{track: func(name string, _ map[string]any) { got = name }}
	a.Track("login_command_execute", nil)
	if got != "login_command_execute" {
		t.Errorf("adapter did not forward: %q", got)
	}
}

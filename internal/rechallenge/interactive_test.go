package rechallenge

import (
	"os"
	"strings"
	"testing"

	"github.com/creack/pty"
)

// Same stdout-vs-stdin sensor bug as appctx.IsInteractive (parity blocker B5).
// This one is live: gql/rechallenge.go:111 and main.go:143 use it to decide
// whether a step-up approval can be prompted for, so a redirected stdout made
// step-up give up on a perfectly interactive terminal.
func TestIsInteractiveContextSensesStdinNotStdout(t *testing.T) {
	ptmx, tty, err := pty.Open()
	if err != nil {
		t.Skipf("pty unavailable: %v", err)
	}
	defer func() { _ = ptmx.Close(); _ = tty.Close() }()
	redirected, err := os.CreateTemp(t.TempDir(), "redirected")
	if err != nil {
		t.Fatal(err)
	}
	defer redirected.Close()

	origIn, origOut := os.Stdin, os.Stdout
	os.Stdin, os.Stdout = tty, redirected
	defer func() { os.Stdin, os.Stdout = origIn, origOut }()

	if !IsInteractiveContext(nil) {
		t.Error("stdin is a TTY and only stdout is redirected: step-up must still be promptable")
	}
}

// ShouldWaitForRechallenge is the opt-out from the non-interactive fail-fast:
// an operator who can approve on another device asks for the old polling
// behavior explicitly. Mirrors the environment half of
// src/lib/rechallenge/flow.ts:shouldWaitForRechallenge.
func TestShouldWaitForRechallenge(t *testing.T) {
	tests := []struct {
		name   string
		argv   []string
		env    string
		setEnv bool
		want   bool
	}{
		{name: "default off", want: false},
		{name: "env =1", env: "1", setEnv: true, want: true},
		{name: "env =0 stays off", env: "0", setEnv: true, want: false},
		{name: "env =true is not 1", env: "true", setEnv: true, want: false},
		{name: "env empty stays off", env: "", setEnv: true, want: false},
		{name: "bare flag", argv: []string{"defensive-mode", "enable", "--rechallenge-wait"}, want: true},
		{name: "flag=true", argv: []string{"--rechallenge-wait=true"}, want: true},
		{name: "flag=false", argv: []string{"--rechallenge-wait=false"}, want: false},
		{name: "flag=0", argv: []string{"--rechallenge-wait=0"}, want: false},
		{name: "flag=OFF", argv: []string{"--rechallenge-wait=OFF"}, want: false},
		{name: "similar flag does not count", argv: []string{"--rechallenge-waiting"}, want: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.setEnv {
				t.Setenv(WaitEnvVar, tc.env)
			}
			if got := shouldWaitCheck(tc.argv); got != tc.want {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

// The message that tells the user how to opt in must name the variable the code
// actually reads. These drift apart the moment they are two independent
// strings.
func TestInteractionRequiredErrorNamesTheRealEnvVar(t *testing.T) {
	err := NewInteractionRequiredError("updateDefensiveModeStatus")
	if !strings.Contains(err.Error(), WaitEnvVar+"=1") {
		t.Errorf("error must tell the user the opt-in that exists; got %q", err.Error())
	}
}

func TestIsInteractiveContext(t *testing.T) {
	tests := []struct {
		name string
		argv []string
		env  map[string]string
		tty  bool
		want bool
	}{
		{"tty + no overrides", nil, nil, true, true},
		{"non-tty", nil, nil, false, false},
		{"VIP_NON_INTERACTIVE=1", nil, map[string]string{"VIP_NON_INTERACTIVE": "1"}, true, false},
		{"--non-interactive in argv", []string{"defensive-mode", "enable", "--non-interactive"}, nil, true, false},
		{"VIP_NON_INTERACTIVE empty doesn't disable", nil, map[string]string{"VIP_NON_INTERACTIVE": ""}, true, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			for k, v := range tc.env {
				t.Setenv(k, v)
			}
			if got := isInteractiveCheck(tc.argv, tc.tty); got != tc.want {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

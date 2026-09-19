package rechallenge

import (
	"os"
	"slices"
	"strings"

	"golang.org/x/term"
)

// IsInteractiveContext returns true when interactive prompts and browser opens
// are appropriate. Mirrors src/lib/rechallenge/flow.ts:isInteractiveContext.
//
// Order:
//  1. VIP_NON_INTERACTIVE=1 → false
//  2. argv contains "--non-interactive" → false
//  3. else stdin-is-tty
//
// Sensed on STDIN for the same reason as appctx.IsInteractive (parity blocker
// B5): an approval has to be typed in, so stdout redirection is irrelevant.
func IsInteractiveContext(argv []string) bool {
	return isInteractiveCheck(argv, term.IsTerminal(int(os.Stdin.Fd())))
}

// isInteractiveCheck is the testable core. The tty value is injected so
// tests don't depend on whether `go test` is run from a TTY.
func isInteractiveCheck(argv []string, tty bool) bool {
	if os.Getenv("VIP_NON_INTERACTIVE") == "1" {
		return false
	}
	if slices.Contains(argv, "--non-interactive") {
		return false
	}
	return tty
}

// WaitEnvVar opts back in to waiting for a step-up approval in a
// non-interactive session. Named as a constant because the error text that
// tells the user about it must not be able to drift from the variable actually
// read.
const WaitEnvVar = "VIP_RECHALLENGE_WAIT"

// WaitFlag is the command-line half of the same opt-in. Registered by the
// commands that can trip step-up (see NewDefensiveModeCmd), matching where
// Node registers it — src/bin/vip-defensive-mode-{enable,disable,configure}.js.
const WaitFlag = "--rechallenge-wait"

// ShouldWaitForRechallenge reports whether the caller has explicitly asked to
// block on a step-up challenge despite being non-interactive — the case where
// an operator running headless will approve on a phone.
//
// Without this, a non-interactive step-up fails fast (see
// NewInteractionRequiredError): the default has to be "fail", because the
// common non-interactive caller is CI, which cannot approve anything and would
// otherwise block until the verification session expires.
//
// Mirrors src/lib/rechallenge/flow.ts:185, including its argv scan and reason
// for it: the step-up middleware is built once at startup and cannot read a
// command's parsed options, so the flag is read from the raw command line even
// though cobra also parses it.
func ShouldWaitForRechallenge() bool {
	return shouldWaitCheck(os.Args)
}

// shouldWaitCheck is the testable core; argv is injected so tests don't have to
// mutate os.Args.
func shouldWaitCheck(argv []string) bool {
	if os.Getenv(WaitEnvVar) == "1" {
		return true
	}
	for _, item := range argv {
		if item == WaitFlag {
			return true
		}
		// `--rechallenge-wait=<value>` counts unless the value is a negation,
		// so `--rechallenge-wait=false` does not silently mean true.
		if value, ok := strings.CutPrefix(item, WaitFlag+"="); ok && !isNegation(value) {
			return true
		}
	}
	return false
}

func isNegation(value string) bool {
	switch strings.ToLower(value) {
	case "0", "false", "no", "off":
		return true
	}
	return false
}

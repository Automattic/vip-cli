package appctx

import (
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"
)

// ErrNonInteractive is returned when a prompt is requested in a non-interactive
// context and no fallback is available. Callers typically use errors.Is to
// detect this and convert to a "missing required flag" error.
var ErrNonInteractive = errors.New("non-interactive context: cannot prompt")

// Confirm asks a yes/no question. Returns ErrNonInteractive when the session
// is non-interactive (caller decides whether to default-deny or fail).
func Confirm(cmd *cobra.Command, message string, defaultYes bool) (bool, error) {
	return confirmCore(IsInteractive(cmd), os.Stderr, message, defaultYes)
}

func confirmCore(interactive bool, stderr io.Writer, message string, defaultYes bool) (bool, error) {
	if !interactive {
		fmt.Fprintf(stderr, "Cannot prompt in non-interactive mode: %s\n", message)
		return false, ErrNonInteractive
	}
	var out bool
	prompt := &survey.Confirm{Message: message, Default: defaultYes}
	if err := survey.AskOne(prompt, &out); err != nil {
		return false, err
	}
	return out, nil
}

// Input asks for a free-form string. If non-interactive and fallback is
// non-empty, returns the fallback; otherwise ErrNonInteractive.
func Input(cmd *cobra.Command, message, fallback string) (string, error) {
	if !IsInteractive(cmd) {
		if fallback != "" {
			return fallback, nil
		}
		return "", ErrNonInteractive
	}
	var out string
	prompt := &survey.Input{Message: message, Default: fallback}
	if err := survey.AskOne(prompt, &out); err != nil {
		return "", err
	}
	return out, nil
}

// Select offers a list. options[0] is the default. Non-interactive with at
// least one option returns options[0]; non-interactive with no options
// returns ErrNonInteractive.
func Select(cmd *cobra.Command, message string, options []string) (string, error) {
	if !IsInteractive(cmd) {
		if len(options) > 0 {
			return options[0], nil
		}
		return "", ErrNonInteractive
	}
	var out string
	prompt := &survey.Select{Message: message, Options: options, Default: options[0]}
	if err := survey.AskOne(prompt, &out); err != nil {
		return "", err
	}
	return out, nil
}

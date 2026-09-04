package edgeworkers

import (
	"errors"
	"fmt"
	"strings"
)

type ProductionConfirmation struct {
	Action, AppName, EnvType                            string
	WorkerNames                                         []string
	EnableAfterDeploy, SkipConfirmation, NonInteractive bool
}

func ConfirmProduction(req ProductionConfirmation, confirm func(string) (bool, error)) error {
	if req.EnvType != "production" || req.SkipConfirmation {
		return nil
	}
	action := req.Action
	if action == "deploy" && req.EnableAfterDeploy {
		action = "deploy and enable"
	}
	if req.NonInteractive {
		return fmt.Errorf("Refusing to %s edge workers in production without confirmation. Pass --skip-confirmation to proceed non-interactively.", action)
	}
	target := EscapeTerminalText(req.AppName) + "." + EscapeTerminalText(req.EnvType)
	var message string
	if req.Action == "enable" {
		if len(req.WorkerNames) == 0 {
			return errors.New("No worker selected.")
		}
		message = fmt.Sprintf("Enable edge worker \"%s\" on %s?", EscapeTerminalText(req.WorkerNames[0]), target)
	} else {
		verb, preposition, label := "Deploy", "to", "edge workers"
		if req.EnableAfterDeploy {
			verb = "Deploy and enable"
			preposition = "on"
		}
		if len(req.WorkerNames) == 1 {
			label = "edge worker"
		}
		message = fmt.Sprintf("%s %d %s (%s) %s %s?", verb, len(req.WorkerNames), label, escapedJoin(req.WorkerNames, ", ", ""), preposition, target)
	}
	return confirmOrCancel(message, confirm)
}
func confirmOrCancel(message string, confirm func(string) (bool, error)) error {
	ok, err := confirm(message)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("Command cancelled by user.")
	}
	return nil
}
func ConfirmDeletion(app, env, name string, force bool, confirm func(string) (bool, error)) error {
	if force {
		return nil
	}
	return confirmOrCancel(fmt.Sprintf("Permanently delete edge worker \"%s\" from %s.%s?", EscapeTerminalText(name), EscapeTerminalText(app), EscapeTerminalText(env)), confirm)
}
func escapedJoin(values []string, separator, fallback string) string {
	parts := make([]string, len(values))
	for i, s := range values {
		parts[i] = EscapeTerminalText(s)
	}
	joined := strings.Join(parts, separator)
	if joined == "" {
		return fallback
	}
	return joined
}

package main

import (
	"errors"
	"strconv"
	"strings"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/telemetry"
)

type authSession struct {
	Raw      string
	Keychain *keychain.Keychain
	Store    *auth.Store
}

type authBootstrapDeps struct {
	Keychain *keychain.Keychain
	Store    *auth.Store
	Login    func() (*auth.Token, error)
}

// withAuthenticatedSession resolves a valid stored token or, when interactive,
// runs login and resumes the original command with the freshly returned token.
func withAuthenticatedSession(
	interactive bool,
	deps authBootstrapDeps,
	next func(*authSession) error,
) error {
	raw, loadErr := deps.Store.Load()
	if loadErr == nil {
		tok, parseErr := auth.ParseToken(raw)
		if parseErr == nil && tok.Valid() {
			return next(&authSession{Raw: tok.Raw, Keychain: deps.Keychain, Store: deps.Store})
		}
	}
	if loadErr != nil && !errors.Is(loadErr, auth.ErrNoToken) {
		return loadErr
	}
	if !interactive {
		if errors.Is(loadErr, auth.ErrNoToken) {
			return errors.New("not logged in: run `vip login` to obtain a token, then retry")
		}
		return errors.New("stored token is invalid or expired: run `vip login` to refresh")
	}

	tok, err := deps.Login()
	if errors.Is(err, auth.ErrLoginCancelled) || auth.IsHandledLoginError(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if tok == nil || !tok.Valid() {
		return errors.New("login completed without a valid token")
	}
	return next(&authSession{Raw: tok.Raw, Keychain: deps.Keychain, Store: deps.Store})
}

// isNonInteractiveArgv detects the root flag without mistaking a raw WP-CLI
// flag after `wp` (or an argument after `--`) for a vip-next flag.
func isNonInteractiveArgv(argv []string) bool {
	nonInteractive := false
	commandSeen := false
	skipFlagValue := false
	for _, arg := range argv {
		if skipFlagValue {
			skipFlagValue = false
			continue
		}
		if arg == "--" {
			return nonInteractive
		}
		// app and env are the only root flags whose value may be a separate
		// token. Do not mistake an app named "wp" for the raw wp command.
		if arg == "--app" || arg == "--env" {
			skipFlagValue = true
			continue
		}
		if arg == "--non-interactive" {
			nonInteractive = true
			continue
		}
		if strings.HasPrefix(arg, "--non-interactive=") {
			value := strings.TrimPrefix(arg, "--non-interactive=")
			parsed, err := strconv.ParseBool(value)
			// A malformed value will later be rejected by cobra. Treat it as
			// non-interactive here so the bootstrap cannot open a browser first.
			nonInteractive = err != nil || parsed
			continue
		}
		if commandSeen || strings.HasPrefix(arg, "-") || strings.HasPrefix(arg, "@") {
			continue
		}
		commandSeen = true
		if arg == "wp" {
			// Everything following the root wp command belongs to WP-CLI.
			return nonInteractive
		}
	}
	return nonInteractive
}

type runDeps struct {
	Tracker     *telemetry.Tracker
	NewKeychain func(apiHost string) *keychain.Keychain
	NewLogin    func(store *auth.Store) func() (*auth.Token, error)
}

type telemetryLoginTracker struct {
	Tracker *telemetry.Tracker
}

func (a telemetryLoginTracker) Track(name string, props map[string]any) {
	a.Tracker.TrackEvent(name, props)
}

func productionRunDeps(tracker *telemetry.Tracker) runDeps {
	return runDeps{
		Tracker:     tracker,
		NewKeychain: keychain.New,
		NewLogin: func(store *auth.Store) func() (*auth.Token, error) {
			flow := auth.NewProductionLoginFlow(
				store,
				telemetryLoginTracker{Tracker: tracker},
				tracker.AliasUser,
			)
			return flow.Run
		},
	}
}

package auth

import (
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/AlecAivazis/survey/v2"
	"github.com/pkg/browser"
)

// TokenURL is the VIP dashboard URL where users retrieve their Personal Access Token.
const TokenURL = "https://dashboard.wpvip.com/me/cli/token"

// ErrLoginCancelled is returned when the user declines the "Ready to authenticate?" prompt.
var ErrLoginCancelled = errors.New("login: cancelled by user")

// Sentinels for the already-messaged validation failures (the flow prints the
// user-facing line; the command treats these as a clean exit, Node parity).
var (
	ErrTokenMalformed = errors.New("login: token malformed")
	ErrTokenExpired   = errors.New("login: token expired")
	ErrTokenInvalid   = errors.New("login: token invalid")
)

// IsHandledLoginError reports whether err is a validation failure the flow
// already reported to the user (so the command should exit 0).
func IsHandledLoginError(err error) bool {
	return errors.Is(err, ErrTokenMalformed) ||
		errors.Is(err, ErrTokenExpired) ||
		errors.Is(err, ErrTokenInvalid)
}

// Tracker abstracts telemetry so tests can record events without a real client.
type Tracker interface {
	Track(name string, props map[string]any)
}

// LoginFlow holds the injectable dependencies for the login sequence.
// All function fields are optional in tests; nil Tracker/SaveToken/Alias are silently skipped.
type LoginFlow struct {
	Stdout    io.Writer
	Tracker   Tracker
	Confirm   func(prompt string) (bool, error)
	OpenURL   func(url string) error
	ReadToken func() (string, error)
	SaveToken func(rawJWT string) error
	Alias     func(userID int64)
}

// NewProductionLoginFlow wires real I/O: survey prompts, system browser, keychain store.
func NewProductionLoginFlow(store *Store, tracker Tracker, alias func(int64)) *LoginFlow {
	return &LoginFlow{
		Stdout:    os.Stdout,
		Tracker:   tracker,
		Confirm:   surveyConfirm,
		OpenURL:   browser.OpenURL,
		ReadToken: surveyPasswordReadToken,
		SaveToken: store.Save,
		Alias:     alias,
	}
}

// Run executes the interactive login flow.
// Apart from the vip-next-specific banner, it mirrors src/bin/vip.js lines 92–178.
func (l *LoginFlow) Run() (*Token, error) {
	// Print banner: empty line, gradient ANSI art, empty line, subtitle, empty
	// line, authenticate line with token URL, empty line.
	fmt.Fprintln(l.Stdout)
	fmt.Fprintln(l.Stdout, "\x1b[38;2;232;196;142m  ██╗   ██╗██╗██████╗        ██████╗██╗     ██╗    ███████╗\x1b[0m")
	fmt.Fprintln(l.Stdout, "\x1b[38;2;224;181;118m  ██║   ██║██║██╔══██╗      ██╔════╝██║     ██║    ██╔════╝\x1b[0m")
	fmt.Fprintln(l.Stdout, "\x1b[38;2;216;164;95m  ██║   ██║██║██████╔╝█████╗██║     ██║     ██║    ███████╗\x1b[0m")
	fmt.Fprintln(l.Stdout, "\x1b[38;2;205;150;78m  ╚██╗ ██╔╝██║██╔═══╝ ╚════╝██║     ██║     ██║    ╚════██║\x1b[0m")
	fmt.Fprintln(l.Stdout, "\x1b[38;2;195;137;60m   ╚████╔╝ ██║██║           ╚██████╗███████╗██║    ███████║\x1b[0m")
	fmt.Fprintln(l.Stdout, "\x1b[38;2;185;124;45m    ╚═══╝  ╚═╝╚═╝            ╚═════╝╚══════╝╚═╝    ╚══════╝\x1b[0m")
	fmt.Fprintln(l.Stdout)
	fmt.Fprintln(l.Stdout, `  VIP-CLI is your tool for interacting with and managing your VIP applications.`)
	fmt.Fprintln(l.Stdout)
	fmt.Fprintln(l.Stdout, `  Authenticate your installation of VIP-CLI with your Personal Access Token. This URL will be opened in your web browser automatically so that you can retrieve your token: `+TokenURL)
	fmt.Fprintln(l.Stdout)

	l.track("login_command_execute", nil)

	ok, err := l.Confirm("Ready to authenticate?")
	if err != nil {
		return nil, err
	}
	if !ok {
		l.track("login_command_browser_cancelled", nil)
		return nil, ErrLoginCancelled
	}

	if err := l.OpenURL(TokenURL); err != nil {
		l.track("login_command_browser_error", map[string]any{"error": err.Error()})
	} else {
		l.track("login_command_browser_opened", nil)
	}

	rawInput, err := l.ReadToken()
	if err != nil {
		return nil, err
	}

	tok, err := ParseToken(rawInput)
	if err != nil {
		fmt.Fprintln(l.Stdout, "The token provided is malformed. Please check the token and try again.")
		l.track("login_command_token_submit_error", map[string]any{"error": err.Error()})
		return nil, fmt.Errorf("%w: %v", ErrTokenMalformed, err)
	}

	if tok.Expired() {
		fmt.Fprintln(l.Stdout, "The token provided is expired. Please log in again to refresh the token.")
		l.track("login_command_token_submit_error", map[string]any{"error": "expired"})
		return nil, ErrTokenExpired
	}

	if !tok.Valid() {
		fmt.Fprintln(l.Stdout, "The provided token is not valid. Please log in again to refresh the token.")
		l.track("login_command_token_submit_error", map[string]any{"error": "invalid"})
		return nil, ErrTokenInvalid
	}

	if l.SaveToken != nil {
		if err := l.SaveToken(tok.Raw); err != nil {
			l.track("login_command_token_submit_error", map[string]any{"error": err.Error()})
			return nil, err
		}
	}

	if l.Alias != nil {
		l.Alias(tok.ID)
	}

	l.track("login_command_token_submit_success", nil)
	return tok, nil
}

func (l *LoginFlow) track(name string, props map[string]any) {
	if l.Tracker == nil {
		return
	}
	l.Tracker.Track(name, props)
}

func surveyConfirm(prompt string) (bool, error) {
	var ans bool
	err := survey.AskOne(&survey.Confirm{Message: prompt}, &ans)
	return ans, err
}

func surveyPasswordReadToken() (string, error) {
	var token string
	err := survey.AskOne(&survey.Password{Message: "Access Token:"}, &token)
	return token, err
}

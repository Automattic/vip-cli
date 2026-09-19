package rechallenge

import (
	"context"
	"fmt"
	"io"
	"os"
	"time"
)

// Tracker is the minimal telemetry interface the runner needs.
type Tracker interface {
	Track(name string, props map[string]any)
}

// Runner orchestrates one step-up flow. All side-effect dependencies are
// injectable for testing.
type Runner struct {
	Client     *Client
	Tracker    Tracker
	TokenCache *TokenCache

	// Stdout receives the user-facing verification prompt. Defaults to os.Stderr
	// (Node's flow.ts uses console.warn so we mirror to stderr).
	Stdout io.Writer

	// OpenURL is called to open the browser when Interactive is true.
	// Defaults to OpenBrowser.
	OpenURL func(url string)

	// Sleep is called between polls. ctx-aware; tests inject a no-op or
	// ctx-blocking variant.
	Sleep func(ctx context.Context, d time.Duration) error
}

// MinPollInterval floors the server-supplied poll interval. A missing, zero, or
// negative pollIntervalSeconds used to produce a zero sleep, i.e. an
// unthrottled status-poll loop against Parker for the life of the session.
// Matches MIN_POLL_INTERVAL_SECONDS in src/lib/rechallenge/flow.ts.
const MinPollInterval = 2 * time.Second

// RunInput contains everything the runner needs for one invocation.
type RunInput struct {
	RequestedOperation string
	Extension          Extension
	Interactive        bool

	// Wait opts a non-interactive caller back in to polling. Without it a
	// step-up challenge raised outside a TTY fails immediately rather than
	// blocking on an approval nobody present can give. See
	// ShouldWaitForRechallenge.
	Wait bool
}

func (r *Runner) writer() io.Writer {
	if r.Stdout != nil {
		return r.Stdout
	}
	return os.Stderr
}

func (r *Runner) sleep(ctx context.Context, d time.Duration) error {
	if r.Sleep != nil {
		return r.Sleep(ctx, d)
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(d):
		return nil
	}
}

func (r *Runner) openURL(url string) {
	if r.OpenURL != nil {
		r.OpenURL(url)
		return
	}
	OpenBrowser(url)
}

// bearerToken returns the credential this runner authenticates with, for use as
// a redaction secret. Nil-safe: callers redact even when there is no token to
// redact, so the JWT pattern still applies.
func (r *Runner) bearerToken() string {
	if r.Client == nil {
		return ""
	}
	return r.Client.BearerToken
}

func (r *Runner) track(name string, props map[string]any) {
	if r.Tracker == nil {
		return
	}
	r.Tracker.Track(name, props)
}

// Run executes the step-up flow and returns the elevated token on success.
func (r *Runner) Run(ctx context.Context, in RunInput) (*ElevatedToken, error) {
	scope := in.RequestedOperation

	if in.Extension.Version != Version {
		return nil, NewUnsupportedVersionError(in.Extension.Version, scope)
	}

	r.track("rechallenge_required", map[string]any{
		"scope":      scope,
		"clientType": ClientType,
	})

	// Fail before creating the session, not after. A step-up challenge in a
	// non-interactive session is unsatisfiable by construction: the approval
	// happens in a browser and there is nobody at one. Polling it anyway meant
	// a CI job blocked for the entire verification window and then failed with
	// "expired" — the worst of both, a long wait and no explanation. Minting
	// the session first would also leave a challenge on the server that can
	// only ever expire unused.
	if !in.Interactive && !in.Wait {
		r.track("rechallenge_interaction_required", map[string]any{"scope": scope})
		return nil, NewInteractionRequiredError(scope)
	}

	session, err := r.Client.CreateSession(CreateSessionInput{
		Path:               in.Extension.CreateSessionPath,
		RequestedOperation: scope,
	})
	if err != nil {
		return nil, err
	}
	r.track("rechallenge_session_created", map[string]any{"scope": scope})

	if in.Interactive {
		r.openURL(session.VerificationURL)
		fmt.Fprintf(r.writer(),
			"⚠  Step-up verification required for %s.\n  Opened %s\n  If your browser did not open, paste the URL above. Expires at %s.\n",
			scope, session.VerificationURL, session.ExpiresAt.Format(time.RFC3339),
		)
	} else {
		fmt.Fprintf(r.writer(),
			"Step-up verification required for %s. Complete it at: %s (expires at %s).\n",
			scope, session.VerificationURL, session.ExpiresAt.Format(time.RFC3339),
		)
	}

	// A session with no usable expiry is not a session we can wait on: the
	// old `!deadline.IsZero()` guard turned a missing or unparseable
	// expiresAt into "no deadline at all", so the loop below polled forever
	// with nothing able to stop it but SIGINT. Node refuses the same case
	// outright (flow.ts:93).
	deadline := session.ExpiresAt
	if deadline.IsZero() {
		return nil, NewTerminalError(StatusExpired, scope,
			"server did not return a usable expiresAt for the verification session")
	}

	pollInterval := time.Duration(session.PollIntervalSeconds) * time.Second
	if pollInterval < MinPollInterval {
		pollInterval = MinPollInterval
	}

	for {
		// Check context cancellation BEFORE sleeping so a pre-cancelled ctx
		// returns AbortedError without polling.
		if ctx.Err() != nil {
			return nil, NewAbortedError(scope)
		}
		if err := r.sleep(ctx, pollInterval); err != nil {
			return nil, NewAbortedError(scope)
		}
		if time.Now().After(deadline) {
			return nil, NewTerminalError(StatusExpired, scope, "session window elapsed before completion")
		}

		ss, err := r.Client.GetSessionStatus(GetSessionStatusInput{
			Template:    in.Extension.StatusPathTemplate,
			ChallengeID: session.ChallengeID,
			Scope:       scope,
		})
		if err != nil {
			return nil, err
		}

		if !ss.Status.IsTerminal() {
			continue
		}

		if ss.Status == StatusVerified {
			provider := ss.Provider
			if provider == "" {
				provider = "unknown"
			}
			r.track("rechallenge_verified", map[string]any{
				"scope":    scope,
				"provider": provider,
			})
			exch, err := r.Client.Exchange(ExchangeInput{
				Template:    in.Extension.ExchangePathTemplate,
				ChallengeID: session.ChallengeID,
				Scope:       scope,
			})
			if err != nil {
				return nil, err
			}
			r.track("rechallenge_exchanged", map[string]any{"scope": scope})
			tok := exch.ElevatedToken
			tok.HeaderName = in.Extension.ElevatedHeaderName
			if r.TokenCache != nil {
				_ = r.TokenCache.Set(scope, tok)
			}
			return &tok, nil
		}

		// Non-verified terminal status.
		r.track(fmt.Sprintf("rechallenge_%s", ss.Status), map[string]any{"scope": scope})
		detail := ""
		if ss.StatusReason != nil {
			// Server-controlled text on its way to the terminal, CI logs, and
			// the telemetry exit hook.
			detail = RedactSecrets(ss.StatusReason.Message, r.bearerToken())
		}
		return nil, NewTerminalError(ss.Status, scope, detail)
	}
}

package gql

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"

	json "encoding/json/v2"

	"github.com/Automattic/vip/internal/rechallenge"
)

const defaultElevatedHeader = "x-elevated-token"

// RechallengeConfig wires the middleware to its token cache + runner.
type RechallengeConfig struct {
	TokenCache *rechallenge.TokenCache
	Runner     *rechallenge.Runner
	// Context, if non-nil, supplies the context used for Parker calls.
	// Defaults to context.Background(); production should pass the cobra
	// command's ctx so SIGINT cancels the flow.
	Context func() context.Context
	// Interactive, when non-nil, replaces the default
	// rechallenge.IsInteractiveContext(nil) fallback for the Runner's
	// Interactive flag. main.go wires this from a closure over the cobra
	// command tree so the middleware honors --non-interactive.
	Interactive func() bool
	// Wait, when non-nil, replaces rechallenge.ShouldWaitForRechallenge as the
	// source of the "block on step-up even though nobody is here" opt-in.
	// Injected by tests; production reads the environment.
	Wait func() bool
	// Stderr receives the step-up failure notice. Defaults to os.Stderr.
	Stderr io.Writer
}

// NewRechallengeMiddleware is the real middleware (M3) replacing the M2 no-op.
//
// On each outbound request:
//
//  1. Parse the GraphQL operation from the body. Non-mutations pass through.
//  2. Preflight: if TokenCache has a token for the mutation's primary field,
//     attach it to the request as the elevated header.
//  3. Call next. Read response body.
//  4. If response contains errors[] with extensions.code == elevated-permission-required
//     and a valid extensions.rechallenge, run the rechallenge flow.
//  5. On flow success: replay request ONCE with the elevated header.
//  6. On flow failure: report WHY to stderr, then return the ORIGINAL response
//     (so error middleware sees it and the exit code is unchanged).
//
// Mirrors src/lib/rechallenge/link.ts, except for step 6's report: Node hides
// the step-up failure behind a `debug()` call, so unless DEBUG was already set
// the user is told only that they lack permission — which is neither the
// problem nor actionable.
func NewRechallengeMiddleware(cfg RechallengeConfig) Middleware {
	return func(next Doer) Doer {
		return &rechallengeDoer{next: next, cfg: cfg}
	}
}

type rechallengeDoer struct {
	next Doer
	cfg  RechallengeConfig
}

func (r *rechallengeDoer) ctx() context.Context {
	if r.cfg.Context != nil {
		if c := r.cfg.Context(); c != nil {
			return c
		}
	}
	return context.Background()
}

func (r *rechallengeDoer) Do(req *http.Request) (*http.Response, error) {
	// Snapshot body so we can replay it on retry. Mirrors the retry
	// middleware's approach; we re-snapshot at this layer for our own retry.
	var body []byte
	if req.Body != nil {
		var err error
		body, err = io.ReadAll(req.Body)
		if err != nil {
			return nil, err
		}
		req.Body = io.NopCloser(bytes.NewReader(body))
		req.ContentLength = int64(len(body))
	}

	op, opErr := ParseOperationFromBody(body)
	if opErr != nil || op == nil || !op.IsMutation || op.PrimaryFieldName == "" {
		return r.next.Do(req)
	}
	scope := op.PrimaryFieldName

	// Preflight: cached elevated token wins.
	if r.cfg.TokenCache != nil {
		if tok, err := r.cfg.TokenCache.Get(scope); err == nil && tok != nil {
			attachElevatedHeader(req, *tok)
		}
	}

	// First attempt.
	resp, err := r.next.Do(req)
	if err != nil || resp == nil {
		return resp, err
	}

	rb, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	resp.Body = io.NopCloser(bytes.NewReader(rb))

	ext := extractElevatedExtension(rb)
	if ext == nil {
		return resp, nil
	}

	if r.cfg.Runner == nil {
		return resp, nil
	}

	interactive := rechallenge.IsInteractiveContext(nil)
	if r.cfg.Interactive != nil {
		interactive = r.cfg.Interactive()
	}
	wait := rechallenge.ShouldWaitForRechallenge()
	if r.cfg.Wait != nil {
		wait = r.cfg.Wait()
	}
	tok, runErr := r.cfg.Runner.Run(r.ctx(), rechallenge.RunInput{
		RequestedOperation: scope,
		Extension:          *ext,
		Interactive:        interactive,
		Wait:               wait,
	})
	if runErr != nil || tok == nil {
		r.reportStepUpFailure(scope, runErr)
		// Surface the ORIGINAL error response upstream.
		return resp, nil
	}

	// Replay with the elevated header. Reuse the original body bytes.
	retryReq := req.Clone(req.Context())
	retryReq.Body = io.NopCloser(bytes.NewReader(body))
	retryReq.ContentLength = int64(len(body))
	attachElevatedHeader(retryReq, *tok)

	return r.next.Do(retryReq)
}

// reportStepUpFailure tells the user why step-up did not produce a token.
//
// Without it the only thing printed is the server's original
// elevated-permission error, which says the user lacks permission — true, but
// it is the symptom, not the cause. "Parker returned HTTP 503", "the approval
// was denied", "this is a non-interactive session" and "the session expired"
// all looked identical, and the reason for each was sitting in an error value
// that was discarded one line later. Same class of bug as 78d0a615.
//
// The text is server-controlled and lands in CI logs and the telemetry exit
// hook, so it goes through RedactSecrets with the bearer token as a known
// secret. rechallenge.Client redacts its own error bodies too; this is the
// second layer, covering error values that do not come from an HTTP body.
func (r *rechallengeDoer) reportStepUpFailure(scope string, runErr error) {
	if runErr == nil {
		return
	}
	w := r.cfg.Stderr
	if w == nil {
		w = os.Stderr
	}
	var token string
	if r.cfg.Runner != nil && r.cfg.Runner.Client != nil {
		token = r.cfg.Runner.Client.BearerToken
	}
	fmt.Fprintf(w, "Step-up verification failed for %s: %s\n",
		scope, rechallenge.RedactSecrets(runErr.Error(), token))
}

func attachElevatedHeader(req *http.Request, tok rechallenge.ElevatedToken) {
	name := tok.HeaderName
	if name == "" {
		name = defaultElevatedHeader
	}
	req.Header.Set(name, tok.Token)
}

// extractElevatedExtension scans the response body for a GraphQL error whose
// extensions.code == elevated-permission-required and whose extensions.rechallenge
// is a complete Extension object. Returns nil if none found.
func extractElevatedExtension(body []byte) *rechallenge.Extension {
	var doc struct {
		Errors []struct {
			Extensions struct {
				Code        string                 `json:"code"`
				Rechallenge *rechallenge.Extension `json:"rechallenge"`
			} `json:"extensions"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil
	}
	for _, e := range doc.Errors {
		if e.Extensions.Code != rechallenge.ElevatedPermissionErrorCode {
			continue
		}
		if e.Extensions.Rechallenge == nil || !e.Extensions.Rechallenge.IsValid() {
			continue
		}
		return e.Extensions.Rechallenge
	}
	return nil
}

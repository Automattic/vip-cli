package gql

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"

	json "encoding/json/v2"
)

// ErrorConfig controls the behavior of the error middleware.
type ErrorConfig struct {
	Stderr      io.Writer
	Exit        func(int)
	Silence     bool // mirrors silenceAuthErrors
	ExitOnError bool // mirrors exitOnError
}

// ctxKeyAllowGQLErrors is a context key that, when set to a true bool,
// instructs the error middleware to skip its print + exit behavior for
// the request's response so the caller can inspect the GraphQL errors
// inline (e.g. vip sync handles "Site is already syncing" specially).
type ctxKeyAllowGQLErrors struct{}

// WithAllowGQLErrors returns a child context that disables the error
// middleware's print + exit-on-error behavior for any GraphQL request
// issued with this context (or one derived from it). Network/401 paths
// are unaffected — only the GraphQL errors[] check is bypassed.
func WithAllowGQLErrors(ctx context.Context) context.Context {
	return context.WithValue(ctx, ctxKeyAllowGQLErrors{}, true)
}

// allowGQLErrorsFromContext reports whether the request's context opts
// out of the error middleware's GraphQL-error handling.
func allowGQLErrorsFromContext(ctx context.Context) bool {
	if ctx == nil {
		return false
	}
	v, _ := ctx.Value(ctxKeyAllowGQLErrors{}).(bool)
	return v
}

// NewErrorMiddleware returns a Middleware that:
//   - On HTTP 401 (and !Silence): prints "Unauthorized: <message>" to Stderr and calls Exit(1).
//   - On GraphQL errors: prints "Error: <message>" for each error; calls Exit(1) if ExitOnError.
//
// Message wording is exact Node parity with src/lib/api.ts errorLink.
func NewErrorMiddleware(cfg ErrorConfig) Middleware {
	if cfg.Stderr == nil {
		cfg.Stderr = os.Stderr
	}
	if cfg.Exit == nil {
		cfg.Exit = os.Exit
	}
	return func(next Doer) Doer { return &errorDoer{next: next, cfg: cfg} }
}

type errorDoer struct {
	next Doer
	cfg  ErrorConfig
}

func (e *errorDoer) Do(req *http.Request) (*http.Response, error) {
	resp, err := e.next.Do(req)
	if err != nil || resp == nil {
		return resp, err
	}

	if resp.StatusCode == 401 && !e.cfg.Silence {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		msg := decode401Message(body)
		fmt.Fprintf(e.cfg.Stderr, "Unauthorized: %s\n", msg)
		e.cfg.Exit(1)
		resp.Body = io.NopCloser(bytes.NewReader(body))
		return resp, nil
	}

	// Peek body for GraphQL errors.
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	resp.Body = io.NopCloser(bytes.NewReader(body))

	if hasGraphQLErrors(body) && !allowGQLErrorsFromContext(req.Context()) {
		for _, m := range extractGraphQLErrorMessages(body) {
			fmt.Fprintf(e.cfg.Stderr, "Error: %s\n", m)
		}
		if e.cfg.ExitOnError {
			e.cfg.Exit(1)
		}
	}
	return resp, nil
}

func decode401Message(body []byte) string {
	const inactivity = "Your token has expired due to inactivity"
	const defaultMsg = "You are not authorized to perform this request"
	const suffix = "; please log out with `vip logout`, then try again."
	if len(body) > 0 {
		var doc struct {
			Code string `json:"code"`
		}
		if err := json.Unmarshal(body, &doc); err == nil && doc.Code == "token-disabled-inactivity" {
			return inactivity + suffix
		}
	}
	return defaultMsg + suffix
}

func hasGraphQLErrors(body []byte) bool {
	var doc struct {
		Errors []map[string]any `json:"errors"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return false
	}
	return len(doc.Errors) > 0
}

func extractGraphQLErrorMessages(body []byte) []string {
	var doc struct {
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil
	}
	out := make([]string, 0, len(doc.Errors))
	for _, e := range doc.Errors {
		out = append(out, e.Message)
	}
	return out
}

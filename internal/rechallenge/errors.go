package rechallenge

import "fmt"

// Error is the base rechallenge error. Specific failure modes carry one as
// their `base` field and expose it via Unwrap so errors.As(err, &*Error{})
// recognizes the family. Naming note: we can't embed *Error anonymously
// because the type name and the Error() method collide.
type Error struct {
	msg   string
	scope string
}

func (e *Error) Error() string { return e.msg }
func (e *Error) Scope() string { return e.scope }

// UnsupportedVersionError — server requested a version this CLI doesn't speak.
type UnsupportedVersionError struct {
	base    Error
	version string
}

func NewUnsupportedVersionError(version, scope string) *UnsupportedVersionError {
	return &UnsupportedVersionError{
		base: Error{
			msg: fmt.Sprintf(
				"Server requested rechallenge version %q but this CLI only supports %s. Update vip-cli.",
				version, Version,
			),
			scope: scope,
		},
		version: version,
	}
}

func (e *UnsupportedVersionError) Error() string   { return e.base.msg }
func (e *UnsupportedVersionError) Scope() string   { return e.base.scope }
func (e *UnsupportedVersionError) Version() string { return e.version }
func (e *UnsupportedVersionError) Unwrap() error   { return &e.base }

// TerminalError — session ended in a non-verified terminal state.
type TerminalError struct {
	base   Error
	status Status
}

func NewTerminalError(status Status, scope, detail string) *TerminalError {
	msg := fmt.Sprintf("Step-up verification did not complete (status=%s)", status)
	if detail != "" {
		msg += ": " + detail
	}
	msg += "."
	return &TerminalError{
		base:   Error{msg: msg, scope: scope},
		status: status,
	}
}

func (e *TerminalError) Error() string  { return e.base.msg }
func (e *TerminalError) Scope() string  { return e.base.scope }
func (e *TerminalError) Status() Status { return e.status }
func (e *TerminalError) Unwrap() error  { return &e.base }

// InteractionRequiredError — a step-up challenge was raised in a session where
// no human can answer it. Returned INSTEAD of opening a verification session,
// because polling one to expiry is an unbounded block in exactly the context
// (CI, cron, a piped script) that can least afford it.
//
// Mirrors RechallengeInteractionRequiredError in src/lib/rechallenge/errors.ts.
// The wording differs on one point: Node offers `--rechallenge-wait` as well as
// the environment variable; vip-next has only the environment variable, because
// the flag has no cobra registration to land on and advertising it would be a
// promise the binary does not keep.
type InteractionRequiredError struct {
	base Error
}

func NewInteractionRequiredError(scope string) *InteractionRequiredError {
	return &InteractionRequiredError{
		base: Error{
			msg: fmt.Sprintf(
				"Step-up verification is required for %s, but this is a non-interactive session, "+
					"so the challenge cannot be approved. Re-run the command interactively, or set "+
					"%s=1 to print the verification URL and wait while you complete it on another "+
					"device. An approval completed interactively is cached, so a later "+
					"non-interactive run of the same operation reuses it until it expires.",
				scope, WaitEnvVar,
			),
			scope: scope,
		},
	}
}

func (e *InteractionRequiredError) Error() string { return e.base.msg }
func (e *InteractionRequiredError) Scope() string { return e.base.scope }
func (e *InteractionRequiredError) Unwrap() error { return &e.base }

// AbortedError — user cancelled the flow (signal or interactive cancel).
type AbortedError struct {
	base Error
}

func NewAbortedError(scope string) *AbortedError {
	return &AbortedError{
		base: Error{msg: "Step-up verification was cancelled.", scope: scope},
	}
}

func (e *AbortedError) Error() string { return e.base.msg }
func (e *AbortedError) Scope() string { return e.base.scope }
func (e *AbortedError) Unwrap() error { return &e.base }

// HttpError — Parker REST endpoint returned a non-2xx response.
type HttpError struct {
	base       Error
	statusCode int
	bodyText   string
}

func NewHttpError(statusCode int, bodyText, scope string) *HttpError {
	return &HttpError{
		base: Error{
			msg: fmt.Sprintf(
				"Step-up verification request failed (HTTP %d): %s", statusCode, bodyText,
			),
			scope: scope,
		},
		statusCode: statusCode,
		bodyText:   bodyText,
	}
}

func (e *HttpError) Error() string    { return e.base.msg }
func (e *HttpError) Scope() string    { return e.base.scope }
func (e *HttpError) StatusCode() int  { return e.statusCode }
func (e *HttpError) BodyText() string { return e.bodyText }
func (e *HttpError) Unwrap() error    { return &e.base }

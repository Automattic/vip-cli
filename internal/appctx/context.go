// Package appctx — context helpers for command-middleware. WithAppContext
// (Task 8) and WithEnvContext (Task 9) stash resolved metadata here so
// handlers can fetch it via FromContext(cmd.Context()).
package appctx

import "context"

// App is the resolved app metadata. Mirrors src/lib/api/app.ts return shape.
// TypeId is the platform site-type identifier (e.g. 1 = Node.js). It defaults
// to 0 when the server omits the field (legacy fixtures, older API versions),
// which is interpreted as "unknown / not Node.js" — preserving Node parity for
// callers that branch on TypeId == 1.
type App struct {
	ID     int64
	Name   string
	TypeId int64
	// Type is the human-readable application type (e.g. "WordPress",
	// "node"). Media-import commands gate on it (media-file-import.ts:18).
	Type string
}

// Env is a resolved environment. DefaultDomain is a String scalar in the
// schema (not an object), so it's a plain Go string here — matches the
// shape ResolveAppByName / ResolveAppByID produce.
//
// AppId mirrors the schema's AppEnvironment.appId. It identifies the "main"
// env (Node parity: `env.appId === env.id` marks the env that owns the
// canonical app slug; see getEnvIdentifier in env_resolver.go).
type Env struct {
	ID            int64
	AppId         int64
	Name          string
	Type          string // "production" | "develop" | "staging" | ...
	DefaultDomain string
	// UniqueLabel is the env's dashboard slug (e.g. "develop"); used in
	// dashboard URLs by export sql and app deploy.
	UniqueLabel  string
	IsMultisite bool
}

// AppEnv pairs the resolved App with its target Env. Either field may be
// zero-valued: WithAppContext sets only App + envs; WithEnvContext narrows
// to a single Env from the envs list.
type AppEnv struct {
	App  App
	Env  Env
	envs []Env // populated by WithAppContext; consumed by WithEnvContext
}

// AvailableEnvs returns the candidate envs from the resolved App. Used by
// WithEnvContext (Task 9) for auto-select / prompt / lookup. Returns a copy
// so callers can't mutate the carrier's slice.
func (a *AppEnv) AvailableEnvs() []Env {
	if a == nil || len(a.envs) == 0 {
		return nil
	}
	out := make([]Env, len(a.envs))
	copy(out, a.envs)
	return out
}

// SetAvailableEnvs replaces the candidate-envs list. Package-internal use
// by app_resolver.go (Task 8). Stores a copy to avoid aliasing the caller's
// slice into the carrier.
func (a *AppEnv) SetAvailableEnvs(envs []Env) {
	if a == nil {
		return
	}
	if len(envs) == 0 {
		a.envs = nil
		return
	}
	a.envs = make([]Env, len(envs))
	copy(a.envs, envs)
}

type appEnvKey struct{}

// WithAppEnv returns a new context carrying ae.
func WithAppEnv(ctx context.Context, ae *AppEnv) context.Context {
	return context.WithValue(ctx, appEnvKey{}, ae)
}

// FromContext extracts the AppEnv set by WithAppEnv, or nil if absent.
// Returns nil if ctx is nil — cobra.Command.Context() can be nil when no
// SetContext / ExecuteContext has run, so middleware that probes for AppEnv
// must not panic on that path.
func FromContext(ctx context.Context) *AppEnv {
	if ctx == nil {
		return nil
	}
	v, _ := ctx.Value(appEnvKey{}).(*AppEnv)
	return v
}

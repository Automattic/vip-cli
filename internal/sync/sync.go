// Package sync wraps the SyncEnvironment + SyncProgress genqlient
// operations behind a Go-friendly surface.
//
// The package intentionally collides with stdlib `sync`; callers should
// import it under an alias (e.g. `syncpkg`).
//
// Node parity references: src/bin/vip-sync.js. Notable schema facts
// discovered while porting:
//
//   - AppEnvironmentSyncInput uses Id (not appId) for the application ID.
//   - AppEnvironmentSyncProgress.sync is Int (the job ID), not String.
//   - AppEnvironmentSyncStep has three fields — Name, Status, Step —
//     where Step is the stable identifier (the plan only listed two).
//
// The "Site is already syncing" GraphQL error is treated specially:
// Start returns an AlreadySyncingError sentinel so the handler can
// proceed to polling without surfacing the message as a fatal error
// (mirrors Node's CombinedGraphQLErrors check).
package sync

import (
	"context"
	"strings"
	"time"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/gql"
)

// AlreadySyncingErrMsg is the exact server error string that signals an
// in-progress sync. Compared as a substring (not equality) because the
// transport may wrap the message with location metadata; Node's check
// uses exact equality against err.message, but matching as substring is
// strictly more permissive and keeps us robust against minor wrapping.
const AlreadySyncingErrMsg = "Site is already syncing"

// AlreadySyncingError is returned by Start when the server rejects the
// mutation because a sync is already underway. Callers detect this with
// errors.As / errors.Is to switch to the "join the existing run" path.
type AlreadySyncingError struct{}

func (AlreadySyncingError) Error() string { return AlreadySyncingErrMsg }

// Status constants — string values that come back from the API.
//
// While a sync runs, the overall status is the name of the current step
// (started, importing, cleanup). Once it ends, it is complete,
// partially_completed or failed. Steps report pending, running, finished
// or failed. running and success are the legacy values and are still
// handled.
const (
	StatusRunning            = "running"
	StatusStarted            = "started"
	StatusImporting          = "importing"
	StatusCleanup            = "cleanup"
	StatusSuccess            = "success"
	StatusComplete           = "complete"
	StatusPartiallyCompleted = "partially_completed"
	StatusFinished           = "finished"
	StatusFailed             = "failed"
	StatusPending            = "pending"
)

// Step is the flat per-step view of an in-flight sync.
type Step struct {
	Name   string
	Status string
	Step   string
}

// Progress is the overall sync state. Sync is the job ID (Int in the
// schema, despite the plan calling it String). Error is the reason the
// sync job recorded, when it failed or partially completed. ProgressText
// is a live, human-readable detail of the current step (e.g. bytes
// transferred).
type Progress struct {
	Status       string
	Error        string
	ProgressText string
	Sync         int64
	Steps        []Step
}

// IsRunning reports whether the overall status means a sync is in
// progress.
func IsRunning(status string) bool {
	switch status {
	case StatusRunning, StatusStarted, StatusImporting, StatusCleanup:
		return true
	}
	return false
}

// IsTerminal reports whether the status string is a terminal state.
// Anything else (running statuses, not_syncing before the job shows up,
// unknown values) keeps the poll going.
func IsTerminal(status string) bool {
	switch status {
	case StatusSuccess, StatusComplete, StatusPartiallyCompleted, StatusFailed:
		return true
	}
	return false
}

// Start triggers a sync of the production env into the target env.
// On "Site is already syncing", returns AlreadySyncingError so the
// caller can fall through to polling. Other GraphQL errors are
// returned verbatim.
//
// The provided ctx MUST opt out of the error middleware via
// gql.WithAllowGQLErrors so the middleware does not Exit(1) on the
// "already syncing" response before this function sees it.
func Start(ctx context.Context, c graphql.Client, appID, envID int64) error {
	id := appID
	envIDLocal := envID
	input := &gql.AppEnvironmentSyncInput{
		Id:            id,
		EnvironmentId: envIDLocal,
	}
	_, err := gql.SyncEnvironment(ctx, c, input)
	if err == nil {
		return nil
	}
	if isAlreadySyncing(err) {
		return AlreadySyncingError{}
	}
	return err
}

// isAlreadySyncing returns true if the err chain contains the
// "Site is already syncing" message. genqlient surfaces server errors
// as a gqlerror.List whose Error() concatenates each .Message; we
// substring-match instead of poking at the list directly to keep this
// resilient to genqlient internals.
func isAlreadySyncing(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), AlreadySyncingErrMsg)
}

// Status returns the current sync progress for (appID, envID). Returns
// (nil, nil) when the server response shape is present but lacks a
// syncProgress block (e.g. immediately after Start fires, before the
// background job kicks in).
func Status(ctx context.Context, c graphql.Client, appID, envID int64) (*Progress, error) {
	resp, err := gql.SyncProgress(ctx, c, appID, envID)
	if err != nil {
		return nil, err
	}
	if resp == nil || resp.App == nil {
		return nil, nil
	}
	for _, e := range resp.App.Environments {
		if e == nil {
			continue
		}
		// Defensive: server-side query already filters by envID, but a future
		// caller (or schema change) might surface multiple envs in the slice.
		// Match explicitly so we never return a sibling env's progress.
		// If the server omits id (nullable scalar), accept the first env —
		// matching pre-filter behavior so test fixtures aren't forced to
		// echo the id back.
		if e.Id != nil && *e.Id != envID {
			continue
		}
		if e.SyncProgress == nil {
			return nil, nil
		}
		p := &Progress{}
		if e.SyncProgress.Status != nil {
			p.Status = *e.SyncProgress.Status
		}
		if e.SyncProgress.Error != nil {
			p.Error = *e.SyncProgress.Error
		}
		if e.SyncProgress.Progress_update_text != nil {
			p.ProgressText = *e.SyncProgress.Progress_update_text
		}
		if e.SyncProgress.Sync != nil {
			p.Sync = *e.SyncProgress.Sync
		}
		for _, s := range e.SyncProgress.Steps {
			if s == nil {
				continue
			}
			step := Step{}
			if s.Name != nil {
				step.Name = *s.Name
			}
			if s.Status != nil {
				step.Status = *s.Status
			}
			if s.Step != nil {
				step.Step = *s.Step
			}
			p.Steps = append(p.Steps, step)
		}
		return p, nil
	}
	return nil, nil
}

// PollOpts configures the Poll loop.
type PollOpts struct {
	// Interval between Status queries. Zero falls back to DefaultInterval.
	Interval time.Duration
	// OnTransition, if non-nil, is invoked exactly once per step on each
	// observed status change (including the first time the step is seen).
	// The argument is the step's NEW state.
	OnTransition func(Step)
	// OnProgressText, if non-nil, is invoked whenever the overall
	// progress text changes (including when it is first seen or cleared).
	OnProgressText func(string)
	// OnError, if non-nil, is consulted on transient Status errors. Return
	// true to keep polling (treat as transient), false to abort the loop
	// with the error.
	OnError func(error) bool
}

// DefaultInterval is the production poll cadence. Tests can override via
// PollOpts.Interval (or, at the handler level, VIP_SYNC_INTERVAL_MS).
const DefaultInterval = 5 * time.Second

// Poll calls Status on a tick and returns when the sync reaches a
// terminal state (see IsTerminal), the context is cancelled, or an
// error is judged fatal by OnError. The first Status call happens
// immediately (no leading sleep), so callers see step transitions
// without waiting one full Interval first.
//
// Footgun: OnError = func(error) bool { return true } + a context with
// no deadline = infinite silent retry loop. The handler in vip sync uses
// that pairing intentionally for Node parity (Node's setInterval ignores
// poll errors), but it relies on the user being there to hit Ctrl-C.
// Callers without an interactive user MUST pass a context with a
// timeout, OR set OnError to a function that returns false after N
// consecutive failures.
func Poll(ctx context.Context, c graphql.Client, appID, envID int64, opts PollOpts) (*Progress, error) {
	interval := opts.Interval
	if interval <= 0 {
		interval = DefaultInterval
	}
	// Track the last-seen status per step (by Step identifier when
	// available, else falling back to Name). Allows the loop to fire
	// OnTransition only on actual change rather than once per tick.
	seen := map[string]string{}
	lastText := ""

	keyOf := func(s Step) string {
		if s.Step != "" {
			return s.Step
		}
		return s.Name
	}

	for {
		p, err := Status(ctx, c, appID, envID)
		if err != nil {
			if opts.OnError != nil && opts.OnError(err) {
				// Transient — sleep and retry.
			} else {
				return nil, err
			}
		} else if p != nil {
			if opts.OnTransition != nil {
				for _, s := range p.Steps {
					k := keyOf(s)
					if prev, ok := seen[k]; !ok || prev != s.Status {
						seen[k] = s.Status
						opts.OnTransition(s)
					}
				}
			}
			if opts.OnProgressText != nil && p.ProgressText != lastText {
				lastText = p.ProgressText
				opts.OnProgressText(p.ProgressText)
			}
			if IsTerminal(p.Status) {
				return p, nil
			}
		}

		select {
		case <-ctx.Done():
			return p, ctx.Err()
		case <-time.After(interval):
		}
	}
}

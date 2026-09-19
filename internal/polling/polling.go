package polling

import (
	"context"
	"fmt"
	"os"
	"time"
)

// Opts configures Loop behavior.
type Opts struct {
	InitialLimit     int           // limit used on the first fetch
	FollowLimit      int           // limit used on subsequent fetches (Node: LIMIT_MAX)
	DefaultInterval  time.Duration // sleep when server doesn't hint a delay
	ServerHintMin    time.Duration // floor for server-hinted delay
	ServerHintMax    time.Duration // ceiling for delay (errors also capped here)
	ErrorBackoffStep time.Duration // added per consecutive error
}

// Page is what a fetch returns.
type Page struct {
	Render           func() error
	NextCursor       *string
	PollingDelaySecs int
}

// Fetch is the caller-supplied page fetcher.
type Fetch func(ctx context.Context, after *string, limit int) (Page, error)

// Loop fetches pages forever (or until ctx cancellation). First-call error
// returns immediately (Node parity). Subsequent errors back off and continue.
func Loop(ctx context.Context, opts Opts, fetch Fetch) error {
	if opts.DefaultInterval == 0 {
		opts.DefaultInterval = 30 * time.Second
	}
	if opts.ServerHintMin == 0 {
		opts.ServerHintMin = 5 * time.Second
	}
	if opts.ServerHintMax == 0 {
		opts.ServerHintMax = 5 * time.Minute
	}
	if opts.ErrorBackoffStep == 0 {
		opts.ErrorBackoffStep = 30 * time.Second
	}
	if opts.FollowLimit == 0 {
		opts.FollowLimit = opts.InitialLimit
	}

	var (
		after     *string
		firstCall = true
		delay     = opts.DefaultInterval
	)

	for {
		limit := opts.InitialLimit
		if !firstCall {
			limit = opts.FollowLimit
		}
		page, err := fetch(ctx, after, limit)
		if err != nil {
			if firstCall {
				return err
			}
			delay += opts.ErrorBackoffStep
			if delay > opts.ServerHintMax {
				delay = opts.ServerHintMax
			}
			fmt.Fprintf(os.Stderr, "Error: Failed to fetch. Trying again in %d seconds.\n", int(delay.Seconds()))
		} else {
			if page.Render != nil {
				if rerr := page.Render(); rerr != nil {
					return rerr
				}
			}
			after = page.NextCursor
			firstCall = false
			if page.PollingDelaySecs > 0 {
				delay = time.Duration(page.PollingDelaySecs) * time.Second
			} else {
				delay = opts.DefaultInterval
			}
			if delay < opts.ServerHintMin {
				delay = opts.ServerHintMin
			}
			if delay > opts.ServerHintMax {
				delay = opts.ServerHintMax
			}
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}
}

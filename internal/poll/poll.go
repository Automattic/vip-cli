// Package poll ports Node's pollUntil helper (src/lib/utils.ts:9-35) — the
// shared ceiling every long-running VIP poll loop is supposed to sit under.
//
// Node:
//
//	export class PollingTimeoutError extends Error {}
//
//	export async function pollUntil< T >(
//		fn: () => Promise< T >,
//		interval: number,
//		isDone: ( v: T ) => boolean,
//		timeoutMs: number = 6 * 60 * 60 * 1000 // Default to 6 hours
//	) {
//		const startTime = Date.now();
//		while ( Date.now() - startTime < timeoutMs ) {
//			const result = await fn();
//			if ( isDone( result ) ) { return result; }
//			await setTimeout( interval );
//		}
//		throw new PollingTimeoutError( 'Polling timed out' );
//	}
//
// Two shape details are load-bearing and deliberately reproduced:
//
//  1. The deadline is evaluated at the TOP of the loop, before `fn` runs, so
//     a non-positive ceiling never calls fn at all.
//  2. The sleep happens only after a not-done result, so the terminal check
//     is never delayed by one interval.
//
// The one addition over Node is context cancellation: Node has no ctx, but a
// Go poll loop that ignores it cannot be interrupted.
package poll

import (
	"context"
	"errors"
	"time"
)

// DefaultTimeout is Node's pollUntil ceiling (utils.ts:18): 6 hours. Callers
// that pass a zero timeout to Until get this.
const DefaultTimeout = 6 * time.Hour

// ErrTimeout ports PollingTimeoutError (utils.ts:9,34). The message matches
// Node's exactly because several callers surface it verbatim to the user.
var ErrTimeout = errors.New("Polling timed out")

// Until calls fn every interval until isDone accepts its result, giving up
// with ErrTimeout once timeout has elapsed. A zero (or negative) interval
// polls without sleeping. timeout is taken literally — Go cannot tell an
// omitted argument from an explicit 0 the way Node's default parameter can,
// so callers resolve DefaultTimeout themselves (same pattern they already
// use for the interval). An error from fn aborts immediately and is returned
// unwrapped, matching Node: a rejection inside pollUntil propagates rather
// than being retried.
func Until[T any](
	ctx context.Context,
	fn func(context.Context) (T, error),
	interval time.Duration,
	isDone func(T) bool,
	timeout time.Duration,
) (T, error) {
	var zero T
	start := time.Now()
	for time.Since(start) < timeout {
		v, err := fn(ctx)
		if err != nil {
			return zero, err
		}
		if isDone(v) {
			return v, nil
		}
		if interval <= 0 {
			continue
		}
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return zero, ctx.Err()
		case <-timer.C:
		}
	}
	return zero, ErrTimeout
}

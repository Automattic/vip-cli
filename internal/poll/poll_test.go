package poll

import (
	"context"
	"errors"
	"testing"
	"time"
)

// TestDefaultTimeoutIsNodesSixHourCeiling pins the ceiling value itself
// (src/lib/utils.ts:18 — `timeoutMs: number = 6 * 60 * 60 * 1000`).
func TestDefaultTimeoutIsNodesSixHourCeiling(t *testing.T) {
	if DefaultTimeout != 6*time.Hour {
		t.Errorf("DefaultTimeout = %v, want 6h (utils.ts:18)", DefaultTimeout)
	}
}

// TestUntilReturnsResultWhenDone is the happy path: fn is retried until
// isDone accepts the value, and that value is returned.
func TestUntilReturnsResultWhenDone(t *testing.T) {
	calls := 0
	got, err := Until(context.Background(),
		func(context.Context) (string, error) {
			calls++
			if calls < 3 {
				return "pending", nil
			}
			return "done", nil
		},
		time.Millisecond,
		func(v string) bool { return v == "done" },
		time.Minute,
	)
	if err != nil {
		t.Fatalf("Until: %v", err)
	}
	if got != "done" {
		t.Errorf("result = %q, want %q", got, "done")
	}
	if calls != 3 {
		t.Errorf("fn calls = %d, want 3", calls)
	}
}

// TestUntilStopsAtCeiling is the regression test for the unbounded poll
// loops. fn NEVER reports done; the loop must still terminate on its own
// once the ceiling elapses, and it must terminate by returning ErrTimeout
// rather than by being cancelled from outside.
//
// Before the fix there was no ceiling at all, so this test hangs forever
// (the harness below turns that into a failure instead of a wedged run).
func TestUntilStopsAtCeiling(t *testing.T) {
	calls := 0
	type result struct {
		err error
	}
	done := make(chan result, 1)
	start := time.Now()
	go func() {
		_, err := Until(context.Background(),
			func(context.Context) (string, error) { calls++; return "pending", nil },
			5*time.Millisecond,
			func(string) bool { return false },
			60*time.Millisecond,
		)
		done <- result{err}
	}()

	select {
	case r := <-done:
		if !errors.Is(r.err, ErrTimeout) {
			t.Fatalf("err = %v, want ErrTimeout", r.err)
		}
		if r.err.Error() != "Polling timed out" {
			t.Errorf("err.Error() = %q, want %q (utils.ts:34)", r.err.Error(), "Polling timed out")
		}
		if elapsed := time.Since(start); elapsed < 60*time.Millisecond {
			t.Errorf("returned after %v, want >= the 60ms ceiling", elapsed)
		}
		if calls == 0 {
			t.Error("fn was never called")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Until never returned: the poll loop is unbounded")
	}
}

// TestUntilChecksDeadlineBeforeCallingFn matches Node's loop shape: the
// `while ( Date.now() - startTime < timeoutMs )` guard is evaluated BEFORE
// the first `await fn()`, so a non-positive ceiling never calls fn at all.
func TestUntilChecksDeadlineBeforeCallingFn(t *testing.T) {
	calls := 0
	_, err := Until(context.Background(),
		func(context.Context) (string, error) { calls++; return "done", nil },
		time.Millisecond,
		func(string) bool { return true },
		0,
	)
	if !errors.Is(err, ErrTimeout) {
		t.Fatalf("err = %v, want ErrTimeout", err)
	}
	if calls != 0 {
		t.Errorf("fn calls = %d, want 0 (Node checks the deadline first)", calls)
	}
}

// TestUntilPropagatesFnError: a failing fn aborts the poll instead of being
// retried, matching a rejected promise inside Node's pollUntil.
func TestUntilPropagatesFnError(t *testing.T) {
	sentinel := errors.New("boom")
	_, err := Until(context.Background(),
		func(context.Context) (string, error) { return "", sentinel },
		time.Millisecond,
		func(string) bool { return true },
		time.Minute,
	)
	if !errors.Is(err, sentinel) {
		t.Errorf("err = %v, want the fn error", err)
	}
}

// TestUntilHonoursContextCancellation — Go-only addition (Node's pollUntil
// has no cancellation): a cancelled context aborts the wait immediately.
func TestUntilHonoursContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(10 * time.Millisecond); cancel() }()
	_, err := Until(ctx,
		func(context.Context) (string, error) { return "pending", nil },
		50*time.Millisecond,
		func(string) bool { return false },
		time.Hour,
	)
	if !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
}

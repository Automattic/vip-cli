package polling

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestLoopFirstCallErrorExits(t *testing.T) {
	opts := Opts{InitialLimit: 100, FollowLimit: 5000, DefaultInterval: 30 * time.Second}
	fetch := func(ctx context.Context, after *string, limit int) (Page, error) {
		return Page{}, errors.New("network down")
	}
	err := Loop(context.Background(), opts, fetch)
	if err == nil {
		t.Error("first-call error must propagate (Node parity)")
	}
}

func TestLoopUsesInitialLimitThenFollowLimit(t *testing.T) {
	opts := Opts{InitialLimit: 100, FollowLimit: 5000, DefaultInterval: 1 * time.Millisecond, ServerHintMin: 1 * time.Millisecond, ServerHintMax: 1 * time.Millisecond}
	var seenLimits []int
	fetch := func(ctx context.Context, after *string, limit int) (Page, error) {
		seenLimits = append(seenLimits, limit)
		if len(seenLimits) >= 3 {
			return Page{}, context.Canceled
		}
		return Page{
			Render:           func() error { return nil },
			NextCursor:       nil,
			PollingDelaySecs: 0,
		}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_ = Loop(ctx, opts, fetch)
	if len(seenLimits) < 2 {
		t.Fatalf("expected at least 2 calls; got %d", len(seenLimits))
	}
	if seenLimits[0] != 100 {
		t.Errorf("first call limit = %d, want 100", seenLimits[0])
	}
	if seenLimits[1] != 5000 {
		t.Errorf("second call limit = %d, want 5000 (FollowLimit)", seenLimits[1])
	}
}

func TestLoopRespectsContextCancellation(t *testing.T) {
	opts := Opts{InitialLimit: 100, FollowLimit: 5000, DefaultInterval: 50 * time.Millisecond}
	fetch := func(ctx context.Context, after *string, limit int) (Page, error) {
		return Page{Render: func() error { return nil }}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if err := Loop(ctx, opts, fetch); err != nil && !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, context.Canceled) {
		t.Errorf("expected ctx cancellation error, got %v", err)
	}
}

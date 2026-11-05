package polling

import (
	"context"
	"errors"
	"testing"
	"testing/synctest"
	"time"
)

func TestLoopBoundsServerHints(t *testing.T) {
	for _, tc := range []struct {
		name string
		hint int
		want time.Duration
	}{
		{"below minimum", 1, 5 * time.Second},
		{"normal", 30, 30 * time.Second},
		{"maximum", 300, 5 * time.Minute},
		{"above maximum", 301, 5 * time.Minute},
		{"maximum GraphQL Int", 2147483647, 5 * time.Minute},
	} {
		t.Run(tc.name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				start := time.Now()
				calls := 0
				err := Loop(ctx, Opts{}, func(context.Context, *string, int) (Page, error) {
					calls++
					if calls == 2 {
						if elapsed := time.Since(start); elapsed != tc.want {
							t.Errorf("next request after %s, want %s", elapsed, tc.want)
						}
						cancel()
					}
					return Page{PollingDelaySecs: tc.hint}, nil
				})
				if !errors.Is(err, context.Canceled) || calls != 2 {
					t.Fatalf("Loop = %v after %d requests; want cancellation after two", err, calls)
				}
			})
		})
	}
}

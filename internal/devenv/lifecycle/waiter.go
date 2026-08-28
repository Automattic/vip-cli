package lifecycle

import (
	"context"
	"fmt"
	"time"
)

// initPollInterval is the default gap between ComposePS polls.
const initPollInterval = 2 * time.Second

// WaitForInit blocks until every service in initServices has exited 0. A
// non-zero exit fails immediately. pollEvery<=0 uses initPollInterval; tests
// pass a tiny value. Honors ctx cancellation.
func WaitForInit(ctx context.Context, d Docker, project string, initServices []string, pollEvery time.Duration) error {
	if pollEvery <= 0 {
		pollEvery = initPollInterval
	}
	want := map[string]bool{}
	for _, s := range initServices {
		want[s] = true
	}
	for {
		states, err := d.ComposePS(ctx, project)
		if err != nil {
			return fmt.Errorf("lifecycle: ps while waiting for init services: %w", err)
		}
		done := map[string]bool{}
		for _, s := range states {
			if !want[s.Service] {
				continue
			}
			if s.State == "exited" {
				if s.ExitCode != 0 {
					return fmt.Errorf("lifecycle: init service %q exited %d", s.Service, s.ExitCode)
				}
				done[s.Service] = true
			}
		}
		if len(done) == len(want) {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(pollEvery):
		}
	}
}

package backup

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/Automattic/vip/internal/tui"
)

func tracker() *tui.ProgressTracker {
	return tui.NewProgressTracker([]tui.ProgressStep{
		{ID: StepPrepare, Name: "Preparing for backup generation"},
		{ID: StepGenerate, Name: "Generating backup"},
	})
}

func scriptedFetch(jobs []*Job, errs []error) Fetch {
	i := 0
	return func(ctx context.Context) (*Job, error) {
		idx := i
		if i < len(jobs)-1 {
			i++
		}
		var err error
		if idx < len(errs) {
			err = errs[idx]
		}
		return jobs[idx], err
	}
}

func TestFormatDuration(t *testing.T) {
	now := time.Now()
	cases := []struct {
		d    time.Duration
		want string
	}{
		{500 * time.Millisecond, "0 second"},
		{time.Second, "1 second"},
		{65 * time.Second, "1 minute 5 seconds"},
		{49 * time.Hour, "2 days 1 hour"},
		{time.Hour + time.Minute + time.Second, "1 hour 1 minute 1 second"},
	}
	for _, tc := range cases {
		if got := FormatDuration(now, now.Add(tc.d)); got != tc.want {
			t.Errorf("FormatDuration(+%v) = %q, want %q", tc.d, got, tc.want)
		}
	}
}

func TestRunHappyPath(t *testing.T) {
	var logs []string
	created := 0
	err := Run(context.Background(), RunOpts{
		Fetch: scriptedFetch([]*Job{
			nil, // initial load: no job
			{InProgressLock: true},
			{InProgressLock: true},
			{InProgressLock: false, Status: "success", BackupName: "b1"},
		}, nil),
		Create:   func(ctx context.Context) error { created++; return nil },
		Tracker:  tracker(),
		Interval: time.Millisecond,
		Log:      func(m string) { logs = append(logs, m) },
	})
	if err != nil {
		t.Fatal(err)
	}
	if created != 1 {
		t.Errorf("Create called %d times", created)
	}
	joined := strings.Join(logs, "|")
	if !strings.Contains(joined, "Generating a new database backup...") ||
		!strings.Contains(joined, "New database backup created") {
		t.Errorf("logs = %v", logs)
	}
}

func TestRunAlreadyInProgress(t *testing.T) {
	var logs []string
	created := 0
	err := Run(context.Background(), RunOpts{
		Fetch: scriptedFetch([]*Job{
			{InProgressLock: true},
			{InProgressLock: false, Status: "success"},
		}, nil),
		Create:   func(ctx context.Context) error { created++; return nil },
		Tracker:  tracker(),
		Interval: time.Millisecond,
		Log:      func(m string) { logs = append(logs, m) },
	})
	if err != nil {
		t.Fatal(err)
	}
	if created != 0 {
		t.Error("Create must not fire when a backup is already running (backup-db.ts:150)")
	}
	if !strings.Contains(strings.Join(logs, "|"), "Database backup already in progress...") {
		t.Errorf("logs = %v", logs)
	}
}

func TestRunFinalStatusNotSuccess(t *testing.T) {
	err := Run(context.Background(), RunOpts{
		Fetch: scriptedFetch([]*Job{
			nil,
			{InProgressLock: false, Status: "failed"},
		}, nil),
		Create:   func(ctx context.Context) error { return nil },
		Tracker:  tracker(),
		Interval: time.Millisecond,
	})
	if err == nil || err.Error() != "Failed to create a new database backup" {
		t.Errorf("err = %v", err)
	}
}

func TestRunCreateFails(t *testing.T) {
	err := Run(context.Background(), RunOpts{
		Fetch:    scriptedFetch([]*Job{nil}, nil),
		Create:   func(ctx context.Context) error { return errors.New("boom") },
		Tracker:  tracker(),
		Interval: time.Millisecond,
	})
	if err == nil || err.Error() != "Couldn't create a new database backup job: boom" {
		t.Errorf("err = %v", err)
	}
}

func TestRunCreateRateLimited(t *testing.T) {
	retryAt := time.Now().Add(90 * time.Minute).Format(time.RFC3339)
	rlErr := gqlerror.List{&gqlerror.Error{
		Message: "rate limited",
		Extensions: map[string]interface{}{
			"errorHttpCode": float64(429),
			"retryAfter":    retryAt,
		},
	}}
	err := Run(context.Background(), RunOpts{
		Fetch:    scriptedFetch([]*Job{nil}, nil),
		Create:   func(ctx context.Context) error { return rlErr },
		Tracker:  tracker(),
		Interval: time.Millisecond,
	})
	if err == nil ||
		!strings.Contains(err.Error(), "A new database backup was not generated because a recently generated backup already exists.") ||
		!strings.Contains(err.Error(), "vip @app.env export sql") ||
		!strings.Contains(err.Error(), "https://docs.wpvip.com/databases/backups/limitations/") {
		t.Errorf("err = %v", err)
	}
	if !strings.Contains(err.Error(), "hour") && !strings.Contains(err.Error(), "minute") {
		t.Errorf("rate-limit message missing duration: %v", err)
	}
}

// TestDefaultPollTimeoutIsNodesSixHourCeiling pins the ceiling `vip backup db`
// inherits from Node: backup-db.ts:198 calls pollUntil with no explicit
// timeout, so it gets the 6h default from utils.ts:18.
func TestDefaultPollTimeoutIsNodesSixHourCeiling(t *testing.T) {
	if DefaultPollTimeout != 6*time.Hour {
		t.Errorf("DefaultPollTimeout = %v, want 6h", DefaultPollTimeout)
	}
}

// TestRunStopsWhenBackupNeverCompletes is the regression test for the
// unbounded generate-phase poll loop: a job whose inProgressLock never
// clears used to spin forever (in CI: a wedged run instead of a failure).
// Node's pollUntil gives up at the ceiling and the surrounding catch turns
// PollingTimeoutError into `Failed to create new database backup: Polling
// timed out` (backup-db.ts:203-212).
func TestRunStopsWhenBackupNeverCompletes(t *testing.T) {
	fetches := 0
	done := make(chan error, 1)
	go func() {
		done <- Run(context.Background(), RunOpts{
			Fetch: func(ctx context.Context) (*Job, error) {
				fetches++
				return &Job{InProgressLock: true}, nil
			},
			Create:   func(ctx context.Context) error { return nil },
			Tracker:  tracker(),
			Interval: time.Millisecond,
			Timeout:  50 * time.Millisecond,
		})
	}()

	select {
	case err := <-done:
		if err == nil || err.Error() != "Failed to create new database backup: Polling timed out" {
			t.Errorf("err = %v, want %q", err,
				"Failed to create new database backup: Polling timed out")
		}
		if fetches < 2 {
			t.Errorf("fetches = %d, want the loop to have actually polled", fetches)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run never returned: the generate-phase poll loop is unbounded")
	}
}

func TestRateLimitInfo(t *testing.T) {
	retryAt := time.Now().Add(time.Hour).UTC().Truncate(time.Second)
	list := gqlerror.List{&gqlerror.Error{
		Message: "x",
		Extensions: map[string]interface{}{
			"errorHttpCode": float64(429),
			"retryAfter":    retryAt.Format(time.RFC3339),
		},
	}}
	got, ok := RateLimitInfo(list)
	if !ok || !got.Equal(retryAt) {
		t.Errorf("got %v ok=%v", got, ok)
	}

	if _, ok := RateLimitInfo(errors.New("plain")); ok {
		t.Error("plain error must not parse as rate limit")
	}
	if _, ok := RateLimitInfo(gqlerror.List{&gqlerror.Error{
		Message: "x", Extensions: map[string]interface{}{"errorHttpCode": float64(500)},
	}}); ok {
		t.Error("non-429 must not parse as rate limit")
	}
}

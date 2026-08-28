// Package backup ports src/commands/backup-db.ts — the `vip backup db`
// runner: trigger a database backup unless one is already running, poll
// the db_backup job until its in-progress lock clears, and verify the
// terminal status.
package backup

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/fatih/color"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/Automattic/vip/internal/poll"
	"github.com/Automattic/vip/internal/tui"
)

// DefaultPollInterval — DB_BACKUP_PROGRESS_POLL_INTERVAL (backup-db.ts:18).
const DefaultPollInterval = time.Second

// DefaultPollTimeout is the ceiling backup-db.ts:198 inherits by calling
// pollUntil without a timeout: 6 hours (src/lib/utils.ts:18).
const DefaultPollTimeout = poll.DefaultTimeout

// Step IDs (backup-db.ts:91).
const (
	StepPrepare  = "prepare"
	StepGenerate = "generate"
)

// Job flattens the db_backup job fields the runner consumes
// (backup-db.ts:129-143).
type Job struct {
	InProgressLock bool
	Status         string // progress.status
	CompletedAt    string
	BackupName     string // metadata[name=backupName].value; "Unknown" fallback is the caller's concern
}

// Fetch retrieves the current db_backup job (nil when none exists).
type Fetch func(ctx context.Context) (*Job, error)

// Create fires the TriggerDatabaseBackup mutation.
type Create func(ctx context.Context) error

// RunOpts configures Run. Tracker must carry the prepare/generate steps.
type RunOpts struct {
	Fetch    Fetch
	Create   Create
	Tracker  *tui.ProgressTracker
	Interval time.Duration
	// Timeout caps the generate-phase poll. Zero means DefaultPollTimeout.
	Timeout time.Duration
	// Log mirrors BackupDBCommand.log (backup-db.ts:108); nil = silent.
	Log func(msg string)
	// FinalizeProgress flushes the completed tracker before the terminal
	// success message is logged, matching BackupDBCommand.stopProgressTracker.
	FinalizeProgress func()
}

// Run ports BackupDBCommand.run (backup-db.ts:145).
func Run(ctx context.Context, opts RunOpts) error {
	interval := opts.Interval
	if interval == 0 {
		interval = DefaultPollInterval
	}
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = DefaultPollTimeout
	}
	logf := opts.Log
	if logf == nil {
		logf = func(string) {}
	}

	job, err := opts.Fetch(ctx)
	if err != nil {
		return fmt.Errorf("Couldn't create a new database backup job: %s", err.Error())
	}

	if job != nil && job.InProgressLock {
		logf("Database backup already in progress...")
	} else {
		logf("Generating a new database backup...")
		_ = opts.Tracker.StepRunning(StepPrepare)
		if err := opts.Create(ctx); err != nil {
			_ = opts.Tracker.StepFailed(StepPrepare)
			if retryAfter, ok := RateLimitInfo(err); ok {
				// backup-db.ts:172-181. Node's template literal ends with
				// a stray tab before the closing backtick; normalized to a
				// plain newline here.
				return fmt.Errorf("A new database backup was not generated because a recently generated backup already exists.\nIf you would like to run the same command, you can retry in %s\nAlternatively, you can export the latest existing database backup by running: %s, right away.\nLearn more about limitations around generating database backups: https://docs.wpvip.com/databases/backups/limitations/\n",
					FormatDuration(time.Now(), retryAfter),
					color.GreenString("vip @app.env export sql"))
			}
			return fmt.Errorf("Couldn't create a new database backup job: %s", err.Error())
		}
	}

	_ = opts.Tracker.StepSuccess(StepPrepare) // auto-promotes generate to running

	// pollUntil(loadBackupJob, 1s, isDone) — isDone = !job.inProgressLock
	// (backup-db.ts:115,198). Node passes no timeout, so this runs under
	// pollUntil's 6h ceiling; PollingTimeoutError falls into the same catch
	// as a fetch failure and becomes "Failed to create new database backup:
	// Polling timed out" (backup-db.ts:203-212).
	if _, err := poll.Until(ctx, opts.Fetch, interval,
		func(j *Job) bool { return j == nil || !j.InProgressLock }, timeout); err != nil {
		_ = opts.Tracker.StepFailed(StepGenerate)
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		return fmt.Errorf("Failed to create new database backup: %s", err.Error())
	}

	_ = opts.Tracker.StepSuccess(StepGenerate)

	// Final verification re-fetch (backup-db.ts:218-224).
	job, err = opts.Fetch(ctx)
	if err != nil || job == nil || job.Status != "success" {
		return errors.New("Failed to create a new database backup")
	}
	if opts.FinalizeProgress != nil {
		opts.FinalizeProgress()
	}
	logf("New database backup created")
	return nil
}

// FormatDuration ports format.ts:242 formatDuration: "<N> day(s) <N>
// hour(s) <N> minute(s) <N> second(s)", omitting zero units, trailing
// space trimmed; "0 second" when under one second.
func FormatDuration(from, to time.Time) string {
	duration := to.Sub(from)
	if duration < time.Second {
		return "0 second"
	}
	days := int(duration / (24 * time.Hour))
	hours := int(duration % (24 * time.Hour) / time.Hour)
	minutes := int(duration % time.Hour / time.Minute)
	seconds := int(duration % time.Minute / time.Second)

	var b strings.Builder
	plural := func(n int, unit string) {
		if n > 0 {
			fmt.Fprintf(&b, "%d %s", n, unit)
			if n > 1 {
				b.WriteString("s")
			}
			b.WriteString(" ")
		}
	}
	plural(days, "day")
	plural(hours, "hour")
	plural(minutes, "minute")
	plural(seconds, "second")
	return strings.TrimRight(b.String(), " ")
}

// RateLimitInfo extracts the 429 rate-limit extensions from a genqlient
// error (gqlerror.List; backup-db.ts:162-166 reads
// extensions.errorHttpCode + extensions.retryAfter). ok=false when the
// error isn't a parseable rate limit.
func RateLimitInfo(err error) (retryAfter time.Time, ok bool) {
	var list gqlerror.List
	var single *gqlerror.Error
	var ext map[string]interface{}
	switch {
	case errors.As(err, &list) && len(list) > 0:
		ext = list[0].Extensions
	case errors.As(err, &single):
		ext = single.Extensions
	default:
		return time.Time{}, false
	}
	code, isFloat := ext["errorHttpCode"].(float64)
	codeInt, isInt := ext["errorHttpCode"].(int)
	if (!isFloat || int(code) != 429) && (!isInt || codeInt != 429) {
		return time.Time{}, false
	}
	raw, _ := ext["retryAfter"].(string)
	if raw == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339, time.RFC1123, "2006-01-02 15:04:05"} {
		if t, perr := time.Parse(layout, raw); perr == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

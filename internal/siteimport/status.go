package siteimport

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/fatih/color"

	"github.com/Automattic/vip/internal/tui"
)

// DefaultPollInterval — IMPORT_SQL_PROGRESS_POLL_INTERVAL (status.ts:25).
const DefaultPollInterval = 5 * time.Second

// JobStep is one step of the import job as reported by the server
// (jobs[].progress.steps or synthesized from importStatus.progress).
type JobStep struct {
	ID     string
	Name   string
	Status tui.StepState
}

// ImportJob mirrors the slice of Job the poller consumes (real k8s job or
// the pseudo-job Node synthesizes from importStatus.progress —
// status.ts:288-328; the synthesis lives in the command's fetch closure).
type ImportJob struct {
	CreatedAt   string
	CompletedAt string
	Status      string // progress.status; "" treated as "unknown" (status.ts:333)
	Steps       []JobStep
}

// FailedStep is a failed entry from importStatus.progress.steps
// (status.ts:361 failedImportStep).
type FailedStep struct {
	Name      string
	Output    []string
	StartedAt int64 // unix seconds
}

// ProgressSnapshot flattens one ImportSQLProgress response. Job == nil
// means "no job data available yet" — the poller waits (or fast-returns
// under ReturnMissingJobImmediately).
type ProgressSnapshot struct {
	Job                     *ImportJob
	StatusProgressStartedAt int64 // importStatus.progress.started_at (unix seconds)
	FailedStep              *FailedStep
	Launched                bool
}

// ProgressFetch retrieves the current snapshot (the command wraps
// gql.ImportSQLProgress).
type ProgressFetch func(ctx context.Context) (*ProgressSnapshot, error)

// CheckStatusOpts configures CheckStatus.
type CheckStatusOpts struct {
	Fetch    ProgressFetch
	Tracker  *tui.ProgressTracker
	Interval time.Duration
	// ReturnMissingJobImmediately — true for `vip import sql status`
	// (status.ts:198).
	ReturnMissingJobImmediately bool
	// OnPoll fires after each snapshot is applied to the tracker, before
	// terminal-state checks — the command renders its suffix block here.
	OnPoll func(createdAt, completedAt, overallStatus string)
}

// StatusResult is the terminal outcome of a finished (non-failed) poll.
type StatusResult struct {
	Status      string
	Message     string // e.g. "No import job found"
	CreatedAt   string
	CompletedAt string
}

// ImportFailedError ports ImportFailedError (status.ts:107).
type ImportFailedError struct {
	InImportProgress bool
	CommandOutput    []string
	ErrorText        string
	StepName         string
	Launched         bool
}

func (e *ImportFailedError) Error() string { return e.ErrorText }

// parseFlexibleTime mimics JS `new Date(s).getTime()`: accept the formats
// the API and the synthesis path produce. Returns ok=false for NaN cases.
func parseFlexibleTime(s string) (time.Time, bool) {
	for _, layout := range []string{
		time.RFC3339, time.RFC1123, time.RFC1123Z, time.RFC822, time.RFC850,
		"2006-01-02 15:04:05", "2006-01-02T15:04:05.000Z",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// CheckStatus ports importSqlCheckStatus's getResults loop
// (status.ts:267-417). The command owns rendering and exit codes; this
// owns the poll-state machine.
func CheckStatus(ctx context.Context, opts CheckStatusOpts) (*StatusResult, error) {
	interval := opts.Interval
	if interval == 0 {
		interval = DefaultPollInterval
	}
	overall := "Checking..." // status.ts:213

	for {
		snap, err := opts.Fetch(ctx)
		if err != nil {
			return nil, err
		}

		if snap.Job == nil {
			if opts.ReturnMissingJobImmediately {
				// status.ts:329 — resolve('No import job found')
				return &StatusResult{Message: "No import job found"}, nil
			}
			// status.ts:294 — progress meta not filled out yet; wait.
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(interval):
			}
			continue
		}

		job := snap.Job
		jobStatus := job.Status
		if jobStatus == "" {
			jobStatus = "unknown" // status.ts:333
		}
		createdAt := job.CreatedAt
		completedAt := job.CompletedAt

		// failedImportStep gate (status.ts:353-366): the import_progress
		// meta is only pertinent when it started at/after job creation.
		var failed *FailedStep
		if jobCreation, ok := parseFlexibleTime(createdAt); ok &&
			snap.StatusProgressStartedAt*1000 >= jobCreation.UnixMilli() {
			if fs := snap.FailedStep; fs != nil && fs.StartedAt*1000 > jobCreation.UnixMilli() {
				failed = fs
			}
		}

		if len(job.Steps) == 0 {
			// status.ts:368 — reject({error: 'Could not enumerate the
			// import job steps'})
			return nil, errors.New("Could not enumerate the import job steps")
		}

		if failed != nil {
			// status.ts:373 — demote the 'import' step to failed, render,
			// then reject with the structured error.
			steps := make([]JobStep, len(job.Steps))
			copy(steps, job.Steps)
			for i := range steps {
				if steps[i].ID == "import" {
					steps[i].Status = tui.StepFailed
				}
			}
			opts.Tracker.SetStepsFromServer(toServerSteps(steps))
			if opts.OnPoll != nil {
				opts.OnPoll(createdAt, completedAt, "failed")
			}
			return nil, &ImportFailedError{
				InImportProgress: true,
				CommandOutput:    failed.Output,
				ErrorText:        "Import step failed",
				StepName:         failed.Name,
				Launched:         snap.Launched,
			}
		}

		opts.Tracker.SetStepsFromServer(toServerSteps(job.Steps))
		if opts.OnPoll != nil {
			opts.OnPoll(createdAt, completedAt, overall)
		}

		if jobStatus == "error" {
			// status.ts:399 — reject({error: 'Import job failed', ...})
			return nil, errors.New("Import job failed")
		}

		if jobStatus != "running" && completedAt != "" {
			// status.ts:404 — resolve(importJob)
			return &StatusResult{
				Status: jobStatus, CreatedAt: createdAt, CompletedAt: completedAt,
			}, nil
		}

		overall = "running" // status.ts:408

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(interval):
		}
	}
}

func toServerSteps(steps []JobStep) []tui.ServerStep {
	out := make([]tui.ServerStep, len(steps))
	for i, s := range steps {
		out[i] = tui.ServerStep{Name: s.Name, Status: s.Status}
	}
	return out
}

// GetErrorMessage ports getErrorMessage (status.ts:116). Message blocks
// are copied verbatim, including blank lines and the conditional
// rollback notice (suppressed for launched environments).
func GetErrorMessage(fe *ImportFailedError) string {
	rollbackMessage := ""
	if !fe.Launched {
		rollbackMessage = "Your site is " + color.BlueString("automatically being rolled back") +
			" to the last backup prior to your import job.\n"
	}

	message := fe.ErrorText
	if !fe.InImportProgress {
		return message
	}

	commandOutputBlock := func() string {
		if fe.CommandOutput != nil {
			joined := strings.Join(fe.CommandOutput, ";")
			return "\nPlease inspect your input file and make the appropriate corrections before trying again.\nThe server said:\n> " +
				color.RedString(joined) + "\n"
		}
		return ""
	}

	switch fe.StepName {
	case "import_preflights":
		message += "\nThis error occurred prior to the mysql batch script processing of your SQL file.\n\nYour site content was not altered.\n\nIf this error persists, please contact support.\n"
	case "importing_db":
		message += "\nThis error occurred during the mysql batch script processing of your SQL file.\n\n" + rollbackMessage
		if fe.CommandOutput != nil {
			message += commandOutputBlock()
		} else {
			message += "Please contact support and include this message along with your sql file."
		}
	case "validating_db":
		message += "\nThis error occurred during the post-import validation of the imported data.\n\n" + rollbackMessage + "\n"
		if fe.CommandOutput != nil {
			message += commandOutputBlock()
		} else {
			message += "Please contact support and include this message along with your sql file."
		}
	case "update_primary_domain":
		message += "\nThis error occurred during the update of the primary domain.\n\n" + rollbackMessage + "\n"
		if fe.CommandOutput != nil {
			message += commandOutputBlock()
		}
	}
	return message
}

// Capitalize ports format.ts capitalize (format.ts:139).
func Capitalize(s string) string {
	if s == "" {
		return ""
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

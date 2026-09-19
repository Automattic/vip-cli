package mediaimport

import (
	"context"
	"strings"
	"time"

	json "encoding/json/v2"

	"encoding/json/jsontext"

	"github.com/fatih/color"
)

// DefaultPollInterval — IMPORT_MEDIA_PROGRESS_POLL_INTERVAL (status.ts:24).
const DefaultPollInterval = time.Second

// StatusFetch retrieves the current media-import status; a nil Status
// means the API returned no mediaImportStatus for the env (status.ts:225).
type StatusFetch func(ctx context.Context) (*Status, error)

// CheckStatusOpts configures CheckStatus.
type CheckStatusOpts struct {
	Fetch    StatusFetch
	Tracker  *Tracker
	Interval time.Duration
	// OnPoll fires after each snapshot is applied, before terminal
	// checks — the command renders its Status/App suffix block here.
	OnPoll func(overallStatus string)
}

// MediaImportError ports ImportFailedError (status.ts:106): the terminal
// failure carries the final status payload for buildErrorMessage.
type MediaImportError struct {
	ErrorText      string
	Status         string
	FailureDetails *FailureDetails
}

func (e *MediaImportError) Error() string { return e.ErrorText }

// intervalRamp ports the poll-interval growth (status.ts:258-266): after
// TWO_MINUTES the interval grows by the base amount once per minute.
// (Node's comment says "decrease"; the code adds — port the code.)
type intervalRamp struct {
	base      time.Duration
	current   time.Duration
	startDate time.Time
	ramping   bool // Node's `pollIntervalDecreasing`
}

func newIntervalRamp(base time.Duration, now time.Time) *intervalRamp {
	return &intervalRamp{base: base, current: base, startDate: now}
}

func (r *intervalRamp) next(now time.Time) time.Duration {
	r.ramping = r.ramping || r.startDate.Before(now.Add(-2*time.Minute))
	if r.ramping && r.startDate.Before(now.Add(-time.Minute)) {
		r.current += r.base
		r.startDate = now
	}
	return r.current
}

// CheckStatus ports mediaImportCheckStatus's getResults loop
// (status.ts:216-275). The command owns rendering, the error-log
// download flow, and exit codes.
func CheckStatus(ctx context.Context, opts CheckStatusOpts) (*Status, error) {
	interval := opts.Interval
	if interval == 0 {
		interval = DefaultPollInterval
	}
	ramp := newIntervalRamp(interval, time.Now())

	for {
		st, err := opts.Fetch(ctx)
		if err != nil {
			// status.ts:232 — reject({error: error.message})
			return nil, &MediaImportError{ErrorText: err.Error()}
		}
		if st == nil {
			// status.ts:227.
			return nil, &MediaImportError{ErrorText: "Requested app/environment is not available for this operation. If you think this is not correct, please contact Support."}
		}

		status := st.Status
		if status == "" {
			status = "unknown" // status.ts:237
		}

		opts.Tracker.SetStatus(*st)

		if status == "FAILED" {
			// status.ts:241-247.
			if opts.OnPoll != nil {
				opts.OnPoll("FAILED")
			}
			return nil, &MediaImportError{
				ErrorText: "Import FAILED", Status: "FAILED", FailureDetails: st.FailureDetails,
			}
		}

		if opts.OnPoll != nil {
			opts.OnPoll(status)
		}

		if status == "COMPLETED" || status == "ABORTED" {
			// status.ts:253 — both resolve successfully.
			return st, nil
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(ramp.next(time.Now())):
		}
	}
}

// BuildErrorMessage ports buildErrorMessage (status.ts:110).
func BuildErrorMessage(fe *MediaImportError) string {
	if fe.Status == "FAILED" && fe.FailureDetails != nil {
		var b strings.Builder
		b.WriteString(color.RedString("Import failed at status: "))
		b.WriteString(color.New(color.FgHiRed, color.Bold).Sprint(fe.FailureDetails.PreviousStatus) + "\n")
		b.WriteString(color.RedString("Errors:"))
		for _, v := range fe.FailureDetails.GlobalErrors {
			b.WriteString("\n\t- " + color.New(color.FgHiRed, color.Bold).Sprint(v))
		}
		return b.String()
	}
	message := color.RedString(fe.ErrorText)
	message += "\n\nPlease check the status of your Import using `vip import media status @mysite.production`"
	message += "\n\nIf this error persists and you are not sure on how to fix, please contact support\n"
	return message
}

// BuildFileErrors ports buildFileErrors (status.ts:134). JSON mode is
// JSON.stringify(data, null, '\t') (format.ts:35) — tab-indented.
func BuildFileErrors(fileErrors []FileError, asJSON bool) string {
	if asJSON {
		out, err := json.Marshal(fileErrors, jsontext.WithIndent("\t"))
		if err != nil {
			return ""
		}
		return string(out)
	}
	var b strings.Builder
	for _, fe := range fileErrors {
		name := fe.FileName
		if name == "" {
			name = "N/A"
		}
		errs := "unknown error"
		if len(fe.Errors) > 0 {
			errs = strings.Join(fe.Errors, ", ")
		}
		b.WriteString("File Name: " + name)
		b.WriteString("\n\nErrors:\n\t- " + errs + "\n\n\n\n")
	}
	return b.String()
}

package sqlexport

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fatih/color"

	"github.com/Automattic/vip/internal/poll"
	"github.com/Automattic/vip/internal/tui"
)

// DefaultPollInterval — EXPORT_SQL_PROGRESS_POLL_INTERVAL (export-sql.ts:34).
const DefaultPollInterval = time.Second

// DefaultPollTimeout is the ceiling export-sql.ts:547 and :555 inherit by
// calling pollUntil without a timeout: 6 hours (src/lib/utils.ts:18).
const DefaultPollTimeout = poll.DefaultTimeout

// Step IDs (export-sql.ts:236).
const (
	StepPrepare              = "prepare"
	StepCreate               = "create"
	StepDownloadLink         = "downloadLink"
	StepConfirmEnoughStorage = "confirmEnoughStorage"
	StepDownload             = "download"
)

// Steps returns the caller-step seed list for the export tracker
// (export-sql.ts:269-275).
func Steps() []tui.ProgressStep {
	return []tui.ProgressStep{
		{ID: StepPrepare, Name: "Preparing for backup download"},
		{ID: StepCreate, Name: "Creating backup copy"},
		{ID: StepDownloadLink, Name: "Requesting download link"},
		{ID: StepConfirmEnoughStorage, Name: "Checking if there's enough storage"},
		{ID: StepDownload, Name: "Downloading file"},
	}
}

// Backup flattens latestBackup (export-sql.ts:43-50).
type Backup struct {
	ID          int64
	SQLDumpTool string
	CreatedAt   string
}

// ExportJob flattens the db_backup_copy job the workflow polls.
type ExportJob struct {
	BackupID     int64  // metadata[name=backupId]
	UploadPath   string // metadata[name=uploadPath]
	BytesWritten string // metadata[name=bytesWritten]
	StepStatus   map[string]string
}

// BackupAndJobs is one AppBackupAndJobStatus response.
type BackupAndJobs struct {
	LatestBackup   *Backup
	Jobs           []ExportJob
	EnvSQLDumpTool string
}

// Deps injects every side effect for tests.
type Deps struct {
	FetchStatus  func(ctx context.Context) (*BackupAndJobs, error)
	CreateExport func(ctx context.Context, backupID int64) error
	GenerateLink func(ctx context.Context, backupID int64) (string, error)
	RunBackup    func(ctx context.Context) error
	StartLive    func(ctx context.Context, cfg []byte) (string, error)
	PollLiveURL  func(ctx context.Context, copyID string) (url string, size int64, err error)
	Confirm      func(message string) (bool, error)
	FreeBytes    func() (int64, error)
	Download     func(ctx context.Context, url, dest string, onProgress OnProgress) error
}

// Options mirror ExportSQLOptions + the env identifiers the messages need.
type Options struct {
	OutputFile     string
	GenerateBackup bool
	SkipDownload   bool
	LiveCopy       *LiveCopyCLIOptions
	Interval       time.Duration
	// Timeout caps each export-job poll. Zero means DefaultPollTimeout.
	Timeout        time.Duration
	AppID          int64
	AppName        string
	EnvUniqueLabel string
}

// exportJobFor finds the job whose backupId metadata matches the latest
// backup (export-sql.ts:296-299).
func exportJobFor(st *BackupAndJobs) *ExportJob {
	if st == nil || st.LatestBackup == nil {
		return nil
	}
	for i := range st.Jobs {
		if st.Jobs[i].BackupID == st.LatestBackup.ID {
			return &st.Jobs[i]
		}
	}
	return nil
}

// Run ports ExportSQLCommand.run (export-sql.ts:375). It returns the path of
// the saved file, or "" when nothing was saved (SkipDownload, or an error).
//
// The "File saved to <path>" message is intentionally NOT printed here: the
// caller prints it AFTER stopping its progress renderer. Emitting it here —
// while the renderer is still animating the step list on stderr — writes a line
// to stdout that shifts the terminal cursor, so the renderer's final cursor-up
// undershoots and leaves a duplicated top line (the dev-env sync progress bug).
func Run(ctx context.Context, tracker *tui.ProgressTracker, opts Options, deps Deps, out io.Writer) (string, error) {
	interval := opts.Interval
	if interval == 0 {
		interval = DefaultPollInterval
	}
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = DefaultPollTimeout
	}

	if opts.OutputFile != "" {
		dir := filepath.Dir(opts.OutputFile)
		if err := checkWritable(dir); err != nil {
			return "", fmt.Errorf("Cannot write to the specified path: %s", err.Error())
		}
	}
	filename := opts.OutputFile
	if filename == "" {
		filename = "exported.sql.gz" // export-sql.ts:390
	}

	_ = tracker.StepRunning(StepPrepare)

	var url string
	var size int64

	if opts.LiveCopy != nil && opts.LiveCopy.UseLiveBackupCopy {
		cfg, err := BuildConfig(opts.LiveCopy)
		if err != nil {
			return "", err
		}
		copyID, err := deps.StartLive(ctx, cfg)
		if err != nil {
			// export-sql.ts:612 wraps every live-copy failure.
			return "", fmt.Errorf("Error creating live backup copy: %s", err.Error())
		}
		_ = tracker.StepSuccess(StepPrepare)
		_ = tracker.StepRunning(StepCreate)
		liveURL, liveSize, err := deps.PollLiveURL(ctx, copyID)
		if err != nil {
			return "", fmt.Errorf("Error creating live backup copy: %s", err.Error())
		}
		_ = tracker.StepSuccess(StepCreate)
		_ = tracker.StepSuccess(StepDownloadLink, downloadURLLine(liveURL))
		url = liveURL
		size = liveSize
	} else {
		standardURL, err := runStandardBackupFlow(ctx, tracker, opts, deps, out, interval, timeout)
		if err != nil {
			return "", err
		}
		url = standardURL

		st, err := deps.FetchStatus(ctx)
		if err != nil {
			return "", err
		}
		job := exportJobFor(st)
		if job == nil {
			return "", errors.New("Export job not found")
		}
		if job.BytesWritten == "" {
			return "", errors.New("Export job metadata does not contain bytesWritten")
		}
		_, _ = fmt.Sscanf(job.BytesWritten, "%d", &size)
	}

	if opts.SkipDownload {
		// export-sql.ts:420-427.
		_ = tracker.StepSkipped(StepConfirmEnoughStorage)
		_ = tracker.StepSkipped(StepDownload)
		return "", nil
	}

	// Prompt errors (e.g. non-interactive) decline like Node's enquirer
	// reject path; FreeBytes errors propagate as-is.
	cont, _, err := ConfirmEnoughStorage(size, deps.FreeBytes, deps.Confirm)
	if err != nil && !cont {
		cont = false
	}
	if !cont {
		_ = tracker.StepFailed(StepConfirmEnoughStorage)
		return "", errors.New("Command canceled by user.")
	}
	_ = tracker.StepSuccess(StepConfirmEnoughStorage)

	// export-sql.ts:449-474 — download with the progress line.
	if err := deps.Download(ctx, url, filename, func(current, total int64) {
		if total > 0 {
			tracker.SetProgress(fmt.Sprintf("- %.2f%% (%s/%s)",
				100*float64(current)/float64(total), FormatBytes(current), FormatBytes(total)))
		}
	}); err != nil {
		_ = tracker.StepFailed(StepDownload)
		return "", fmt.Errorf("Error downloading exported file: %s", err.Error())
	}
	_ = tracker.StepSuccess(StepDownload)
	return filename, nil
}

// runStandardBackupFlow ports runBackup (export-sql.ts:481).
func runStandardBackupFlow(ctx context.Context, tracker *tui.ProgressTracker, opts Options, deps Deps, out io.Writer, interval, timeout time.Duration) (string, error) {
	if opts.GenerateBackup {
		// export-sql.ts:350-355 NOTICE block.
		notice := "\n" + color.YellowString("NOTICE: ") +
			"If a recent database backup does not exist, a new one will be generated for this environment. " +
			"Learn more about this: https://docs.wpvip.com/databases/backups/download-a-full-database-backup/ \n"
		fmt.Fprintln(out, notice)
		if err := deps.RunBackup(ctx); err != nil {
			return "", err
		}
	}

	st, err := deps.FetchStatus(ctx)
	if err != nil {
		return "", err
	}
	if st.LatestBackup == nil {
		return "", fmt.Errorf("No backup found for site %s", opts.AppName)
	}
	latest := st.LatestBackup

	var prepareInfo []string
	tool := latest.SQLDumpTool
	if tool == "" {
		tool = st.EnvSQLDumpTool
	}
	if tool == "mydumper" {
		prepareInfo = append(prepareInfo, color.New(color.FgYellow, color.Bold).Sprint("WARNING:")+
			" This is a large or complex database. The backup file for this database is generated with MyDumper. The file can only be loaded with MyLoader. For more information: https://github.com/mydumper/mydumper")
	}

	if exportJobFor(st) != nil {
		prepareInfo = append(prepareInfo,
			fmt.Sprintf("Attaching to an existing export for the backup with timestamp %s", latest.CreatedAt))
	} else {
		prepareInfo = append(prepareInfo,
			fmt.Sprintf("Exporting database backup with timestamp %s", latest.CreatedAt))
		if err := deps.CreateExport(ctx, latest.ID); err != nil {
			// export-sql.ts:525-543.
			if strings.Contains(err.Error(), "Backup Copy already in progress") {
				return "", fmt.Errorf("There is an export job already running for this environment: https://dashboard.wpvip.com/apps/%d/%s/database/backups\nCurrently, we allow only one export job at a time, per site. Please try again later.",
					opts.AppID, opts.EnvUniqueLabel)
			}
			return "", fmt.Errorf("Error creating export job: %s", err.Error())
		}
	}

	// poll preflight success → PREPARE done (export-sql.ts:547-553).
	if err := pollStep(ctx, deps, interval, timeout, "preflight"); err != nil {
		return "", err
	}
	_ = tracker.StepSuccess(StepPrepare, prepareInfo...)

	// poll upload_backup success → CREATE done (export-sql.ts:555-560).
	if err := pollStep(ctx, deps, interval, timeout, "upload_backup"); err != nil {
		return "", err
	}
	_ = tracker.StepSuccess(StepCreate)

	url, err := deps.GenerateLink(ctx, latest.ID)
	if err != nil {
		return "", err
	}
	_ = tracker.StepSuccess(StepDownloadLink, downloadURLLine(url))
	return url, nil
}

// pollStep waits until the export job's step with the given id reports
// success (isPrepared/isCreated, export-sql.ts:323-337). Node calls pollUntil
// with no timeout, so this sits under the shared 6h ceiling; on expiry the
// PollingTimeoutError propagates uncaught out of runBackup, surfacing as
// "Polling timed out".
func pollStep(ctx context.Context, deps Deps, interval, timeout time.Duration, stepID string) error {
	_, err := poll.Until(ctx, deps.FetchStatus, interval,
		func(st *BackupAndJobs) bool {
			job := exportJobFor(st)
			return job != nil && job.StepStatus[stepID] == "success"
		}, timeout)
	return err
}

// downloadURLLine — generateDownloadURLOutputString (export-sql.ts:477).
func downloadURLLine(url string) string {
	return color.GreenString("Download URL") + ": " + url
}

// checkWritable mirrors fs.accessSync(dir, W_OK) (export-sql.ts:378).
func checkWritable(dir string) error {
	fi, err := os.Stat(dir)
	if err != nil {
		return err
	}
	if !fi.IsDir() {
		return fmt.Errorf("not a directory: %s", dir)
	}
	probe, err := os.CreateTemp(dir, ".vip-write-probe-*")
	if err != nil {
		return err
	}
	name := probe.Name()
	probe.Close()
	return os.Remove(name)
}

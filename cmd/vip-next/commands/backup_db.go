package commands

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/backup"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/tui"
)

// BackupDBCmd returns `vip backup db`.
//
// Node parity: src/bin/vip-backup-db.ts + src/commands/backup-db.ts.
// Triggers a database backup (unless one is already running) and polls
// the db_backup job until its in-progress lock clears.
func BackupDBCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "db",
		Short: "Generate a new database backup of an environment",
		Long: "Generate a new database backup of a VIP Platform environment. If a backup is already " +
			"in progress, the command attaches to it and polls until completion.",
		Args: cobra.NoArgs,
	}
	addAppEnvFlags(cmd)
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRun(runBackupDB)
}

// backupPollInterval — VIP_BACKUP_DB_INTERVAL_MS overrides the 1s Node
// default for tests.
func backupPollInterval() time.Duration {
	if v := os.Getenv("VIP_BACKUP_DB_INTERVAL_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return backup.DefaultPollInterval
}

// backupPollTimeout — VIP_BACKUP_DB_TIMEOUT_MS overrides Node's 6h pollUntil
// ceiling (backup-db.ts:198 → utils.ts:18) so the ceiling is reachable in a
// test. Same knob shape as VIP_BACKUP_DB_INTERVAL_MS.
func backupPollTimeout() time.Duration {
	if v := os.Getenv("VIP_BACKUP_DB_TIMEOUT_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return backup.DefaultPollTimeout
}

// fetchBackupJob flattens AppBackupJobStatus into backup.Job
// (backup-db.ts:53,129).
func fetchBackupJob(ctx context.Context, appID, envID int64) (*backup.Job, error) {
	cfg := GetConfig()
	resp, err := gql.AppBackupJobStatus(ctx, cfg.GQLClient, appID, envID)
	if err != nil {
		return nil, err
	}
	if resp == nil || resp.App == nil || len(resp.App.Environments) == 0 || resp.App.Environments[0] == nil {
		return nil, nil
	}
	jobs := resp.App.Environments[0].Jobs
	if len(jobs) == 0 || jobs[0] == nil {
		return nil, nil
	}
	job := *jobs[0]
	out := &backup.Job{BackupName: "Unknown"}
	if lock := job.GetInProgressLock(); lock != nil {
		out.InProgressLock = *lock
	}
	if c := job.GetCompletedAt(); c != nil {
		out.CompletedAt = *c
	}
	if p := job.GetProgress(); p != nil && p.Status != nil {
		out.Status = *p.Status
	}
	for _, m := range job.GetMetadata() {
		if m != nil && m.Name != nil && *m.Name == "backupName" && m.Value != nil {
			out.BackupName = *m.Value
		}
	}
	return out, nil
}

func runBackupDB(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	out := cmd.OutOrStdout()

	trackEvent("backup_db_execute", nil)

	pt := tui.NewProgressTracker([]tui.ProgressStep{
		{ID: backup.StepPrepare, Name: "Preparing for backup generation"},
		{ID: backup.StepGenerate, Name: "Generating backup"},
	})
	renderer := startBackupProgressRenderer(cmd, pt)
	defer renderer.stop(cmd, false)

	pollCtx := gql.WithAllowGQLErrors(cmd.Context())
	err := backup.Run(pollCtx, backup.RunOpts{
		Fetch: func(ctx context.Context) (*backup.Job, error) {
			return fetchBackupJob(ctx, ae.App.ID, ae.Env.ID)
		},
		Create: func(ctx context.Context) error {
			input := &gql.AppEnvironmentTriggerDBBackupInput{Id: ae.App.ID, EnvironmentId: ae.Env.ID}
			_, err := gql.TriggerDatabaseBackup(ctx, cfg.GQLClient, input)
			return err
		},
		Tracker:          pt,
		Interval:         backupPollInterval(),
		Timeout:          backupPollTimeout(),
		Log:              func(msg string) { fmt.Fprintln(out, msg) },
		FinalizeProgress: func() { renderer.stopCompact(cmd, true) },
	})
	if err != nil {
		renderer.stop(cmd, true)
		return err
	}
	renderer.stop(cmd, true)
	trackEvent("backup_db_success", nil)
	return nil
}

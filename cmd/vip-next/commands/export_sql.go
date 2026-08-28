package commands

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	jsonv1 "encoding/json"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/backup"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/sqlexport"
	"github.com/Automattic/vip/internal/tui"
)

// ExportSQLCmd returns `vip export sql`.
//
// Node parity: src/bin/vip-export-sql.js + src/commands/export-sql.ts.
// Full exports ride the latest db_backup (optionally regenerating it);
// the --table/--site-id/--wpcli-command/--config-file options switch to
// the live-backup-copy (partial export) flow.
func ExportSQLCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "sql",
		Short: "Download a copy of the most recent database backup for an environment",
		Long: "Download an archived copy of the most recent database backup for a VIP Platform " +
			"environment, or generate and download a partial database export.",
		Args: cobra.NoArgs,
	}
	cmd.Flags().StringP("output", "o", "", "Download the file to a specific local directory path with a custom file name.")
	cmd.Flags().StringArrayP("table", "t", nil, "The name of a table to include in the partial database export. Accepts a string value and can be passed more than once with a different value, or add multiple values in a comma-separated list.")
	cmd.Flags().StringArrayP("site-id", "s", nil, "The ID of a network site to include in the partial database export. Accepts an integer value and can be passed more than once with a different value, or add multiple values in a comma-separated list.")
	cmd.Flags().StringP("wpcli-command", "w", "", "Run a custom WP-CLI command that has logic to retrieve specific data for the partial database export.")
	cmd.Flags().StringP("config-file", "c", "", "A local configuration file that specifies the data to include in the partial database export. Accepts a relative or absolute path to the file.")
	cmd.Flags().BoolP("generate-backup", "g", false, "Generate a fresh database backup and export an archived copy of that backup.")
	cmd.Flags().Bool("skip-download", false, "Skip downloading the file.")

	addAppEnvFlags(cmd)
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRun(runExportSQL)
}

// exportPollInterval — VIP_EXPORT_SQL_INTERVAL_MS overrides the 1s Node
// default for tests.
func exportPollInterval() time.Duration {
	if v := os.Getenv("VIP_EXPORT_SQL_INTERVAL_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return sqlexport.DefaultPollInterval
}

// exportPollTimeout — VIP_EXPORT_SQL_TIMEOUT_MS overrides Node's 6h pollUntil
// ceiling (export-sql.ts:547,555 → utils.ts:18) so the ceiling is reachable
// in a test. Same knob shape as VIP_EXPORT_SQL_INTERVAL_MS.
func exportPollTimeout() time.Duration {
	if v := os.Getenv("VIP_EXPORT_SQL_TIMEOUT_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return sqlexport.DefaultPollTimeout
}

// fetchBackupAndJobs flattens AppBackupAndJobStatus (export-sql.ts:103).
func fetchBackupAndJobs(ctx context.Context, appID, envID int64) (*sqlexport.BackupAndJobs, error) {
	cfg := GetConfig()
	resp, err := gql.AppBackupAndJobStatus(ctx, cfg.GQLClient, appID, envID)
	if err != nil {
		return nil, err
	}
	st := &sqlexport.BackupAndJobs{}
	if resp == nil || resp.App == nil || len(resp.App.Environments) == 0 || resp.App.Environments[0] == nil {
		return st, nil
	}
	env := resp.App.Environments[0]
	if env.BackupsSqlDumpTool != nil {
		st.EnvSQLDumpTool = *env.BackupsSqlDumpTool
	}
	if lb := env.LatestBackup; lb != nil {
		b := &sqlexport.Backup{}
		if lb.Id != nil {
			b.ID = int64(*lb.Id) // schema Backup.id is a Float
		}
		if lb.SqlDumpTool != nil {
			b.SQLDumpTool = *lb.SqlDumpTool
		}
		if lb.CreatedAt != nil {
			b.CreatedAt = *lb.CreatedAt
		}
		st.LatestBackup = b
	}
	for _, j := range env.Jobs {
		if j == nil {
			continue
		}
		job := *j
		ej := sqlexport.ExportJob{StepStatus: map[string]string{}}
		for _, m := range job.GetMetadata() {
			if m == nil || m.Name == nil || m.Value == nil {
				continue
			}
			switch *m.Name {
			case "backupId":
				if n, err := strconv.ParseInt(*m.Value, 10, 64); err == nil {
					ej.BackupID = n
				}
			case "uploadPath":
				ej.UploadPath = *m.Value
			case "bytesWritten":
				ej.BytesWritten = *m.Value
			}
		}
		if p := job.GetProgress(); p != nil {
			for _, s := range p.Steps {
				if s == nil || s.Id == nil || s.Status == nil {
					continue
				}
				ej.StepStatus[*s.Id] = *s.Status
			}
		}
		st.Jobs = append(st.Jobs, ej)
	}
	return st, nil
}

// buildExportDeps assembles the M7 SQL-export side effects (backup status,
// export job, download link, backup generation, live-copy) around the GQL
// client. Shared by `export sql` and `dev-env sync sql` so both flows drive the
// same platform machinery.
func buildExportDeps(cmd *cobra.Command, appID, envID int64, out io.Writer) sqlexport.Deps {
	cfg := GetConfig()
	return sqlexport.Deps{
		FetchStatus: func(ctx context.Context) (*sqlexport.BackupAndJobs, error) {
			return fetchBackupAndJobs(ctx, appID, envID)
		},
		CreateExport: func(ctx context.Context, backupID int64) error {
			bid := float64(backupID)
			_, err := gql.BackupDBCopy(ctx, cfg.GQLClient, &gql.AppEnvironmentStartDBBackupCopyInput{
				Id: &appID, EnvironmentId: &envID, BackupId: &bid,
			})
			return err
		},
		GenerateLink: func(ctx context.Context, backupID int64) (string, error) {
			bid := float64(backupID)
			resp, err := gql.GenerateDBBackupCopyUrl(ctx, cfg.GQLClient, &gql.AppEnvironmentGenerateDBBackupCopyUrlInput{
				Id: &appID, EnvironmentId: &envID, BackupId: &bid,
			})
			if err != nil {
				return "", err
			}
			if resp == nil || resp.GenerateDBBackupCopyUrl == nil || resp.GenerateDBBackupCopyUrl.Url == nil {
				return "", nil // Node: response... ?? '' (export-sql.ts:179)
			}
			return *resp.GenerateDBBackupCopyUrl.Url, nil
		},
		RunBackup: func(ctx context.Context) error {
			return backup.Run(ctx, backup.RunOpts{
				Fetch: func(ctx context.Context) (*backup.Job, error) {
					return fetchBackupJob(ctx, appID, envID)
				},
				Create: func(ctx context.Context) error {
					input := &gql.AppEnvironmentTriggerDBBackupInput{Id: appID, EnvironmentId: envID}
					_, err := gql.TriggerDatabaseBackup(ctx, cfg.GQLClient, input)
					return err
				},
				Tracker: tui.NewProgressTracker([]tui.ProgressStep{
					{ID: backup.StepPrepare, Name: "Preparing for backup generation"},
					{ID: backup.StepGenerate, Name: "Generating backup"},
				}),
				Interval: backupPollInterval(),
				Timeout:  backupPollTimeout(),
				Log:      func(msg string) { fmt.Fprintln(out, msg) },
			})
		},
		// lcfg is the finished JSON document for the `config: JSON` scalar —
		// for --config-file it carries every key the user wrote, so it must
		// go on the wire untouched.
		StartLive: func(ctx context.Context, lcfg []byte) (string, error) {
			rawMsg := jsonv1.RawMessage(lcfg)
			resp, err := gql.StartLiveBackupCopy(ctx, cfg.GQLClient, &gql.LiveBackupCopyConfigInput{
				Id: appID, EnvironmentId: envID, Config: &rawMsg,
			})
			if err != nil {
				return "", err
			}
			if resp == nil || resp.StartLiveBackupCopy == nil || resp.StartLiveBackupCopy.CopyId == nil ||
				*resp.StartLiveBackupCopy.CopyId == "" {
				msg := "Unknown error"
				if resp != nil && resp.StartLiveBackupCopy != nil && resp.StartLiveBackupCopy.Message != nil &&
					*resp.StartLiveBackupCopy.Message != "" {
					msg = *resp.StartLiveBackupCopy.Message
				}
				return "", fmt.Errorf("Failed to start partial database export: %s", msg)
			}
			return *resp.StartLiveBackupCopy.CopyId, nil
		},
		PollLiveURL: func(ctx context.Context, copyID string) (string, int64, error) {
			return pollLiveBackupURL(ctx, appID, envID, copyID)
		},
		Confirm: func(message string) (bool, error) {
			return importConfirmPrompt(cmd, message, false)
		},
		FreeBytes: func() (int64, error) {
			return sqlexport.FreeBytesAt(sqlexport.VipDataPath())
		},
		Download: sqlexport.DownloadFile,
	}
}

func runExportSQL(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	out := cmd.OutOrStdout()

	output, _ := cmd.Flags().GetString("output")
	tables, _ := cmd.Flags().GetStringArray("table")
	siteIDs, _ := cmd.Flags().GetStringArray("site-id")
	wpcliCommand, _ := cmd.Flags().GetString("wpcli-command")
	configFile, _ := cmd.Flags().GetString("config-file")
	generateBackup, _ := cmd.Flags().GetBool("generate-backup")
	skipDownload, _ := cmd.Flags().GetBool("skip-download")

	liveCopy, err := sqlexport.ParseLiveCopyCLIOptions(configFile, tables, siteIDs, wpcliCommand)
	if err != nil {
		return err
	}

	trackEvent("export_sql_execute", map[string]any{
		"generate_backup": generateBackup, "live_backup_copy": liveCopy.UseLiveBackupCopy,
	})

	if output != "" {
		// Node getAbsolutePath resolves ~ and relative paths (utils).
		if strings.HasPrefix(output, "~"+string(filepath.Separator)) {
			if home, herr := os.UserHomeDir(); herr == nil {
				output = filepath.Join(home, output[2:])
			}
		}
		if abs, aerr := filepath.Abs(output); aerr == nil {
			output = abs
		}
	}

	pt := tui.NewProgressTracker(sqlexport.Steps())
	renderer := startImportProgressRenderer(cmd, pt)
	defer renderer.stop(cmd, false)

	pollCtx := gql.WithAllowGQLErrors(cmd.Context())
	appID := ae.App.ID
	envID := ae.Env.ID

	deps := buildExportDeps(cmd, appID, envID, out)

	savedPath, err := sqlexport.Run(pollCtx, pt, sqlexport.Options{
		OutputFile:     output,
		GenerateBackup: generateBackup,
		SkipDownload:   skipDownload,
		LiveCopy:       liveCopy,
		Interval:       exportPollInterval(),
		Timeout:        exportPollTimeout(),
		AppID:          appID,
		AppName:        ae.App.Name,
		EnvUniqueLabel: ae.Env.UniqueLabel,
	}, deps, out)
	renderer.stop(cmd, true)
	if err != nil {
		return err
	}
	// Print AFTER stopping the renderer (export-sql.ts:480). Emitting it while
	// the renderer is still animating would shift the cursor and duplicate the
	// top progress line.
	if savedPath != "" {
		fmt.Fprintf(out, "File saved to %s\n", savedPath)
	}
	trackEvent("export_sql_success", nil)
	return nil
}

// pollLiveBackupURL ports getDownloadURL (live-backup-copy.ts:166): poll
// the mutation every 5s for up to 2h until url is set and processing is
// false. VIP_EXPORT_SQL_INTERVAL_MS shrinks the interval in tests.
func pollLiveBackupURL(ctx context.Context, appID, envID int64, copyID string) (string, int64, error) {
	cfg := GetConfig()
	interval := 5 * time.Second
	if v := os.Getenv("VIP_EXPORT_SQL_INTERVAL_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			interval = time.Duration(n) * time.Millisecond
		}
	}
	const timeoutSeconds = 2 * 60 * 60
	deadline := time.Now().Add(timeoutSeconds * time.Second)

	for {
		resp, err := gql.GenerateLiveBackupCopyDownloadURL(ctx, cfg.GQLClient,
			&gql.AppEnvironmentLiveBackupCopyDownloadURLInput{
				Id: appID, EnvironmentId: envID, CopyId: copyID,
			})
		if err != nil {
			return "", 0, fmt.Errorf("Failed to generate download URL: %s", err.Error())
		}
		r := resp.GenerateLiveBackupCopyDownloadURL
		if r != nil && r.Url != nil && *r.Url != "" && !r.Processing {
			if !r.Success || r.Size == nil || *r.Size == 0 {
				return "", 0, fmt.Errorf("Failed to generate download URL: %s", *r.Url)
			}
			return *r.Url, *r.Size, nil
		}
		if time.Now().After(deadline) {
			return "", 0, fmt.Errorf("Failed to generate download URL: Polling timed out after %d seconds", timeoutSeconds)
		}
		select {
		case <-ctx.Done():
			return "", 0, ctx.Err()
		case <-time.After(interval):
		}
	}
}

package commands

import (
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/sqlexport"
	"github.com/Automattic/vip/internal/tui"
)

func newDevEnvSyncCmd() *cobra.Command {
	sync := &cobra.Command{Use: "sync", Short: "Sync a VIP Platform environment into a local environment"}
	sync.AddCommand(newDevEnvSyncSQLCmd())
	return sync
}

func newDevEnvSyncSQLCmd() *cobra.Command {
	c := &cobra.Command{
		Use:           "sql",
		Short:         "Sync the database of a VIP Platform environment to a local environment",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	addSlugFlag(c)
	c.Flags().StringArrayP("table", "t", nil, "Table to include in a partial sync (repeatable, or comma-separated).")
	c.Flags().StringArray("site-id", nil, "Network site id to include in a partial sync (repeatable, or comma-separated).")
	c.Flags().StringP("wpcli-command", "w", "", "Custom WP-CLI command that retrieves the data for a partial export.")
	c.Flags().StringP("config-file", "c", "", "Local configuration file specifying the data to sync.")
	c.Flags().StringArrayP("search-replace", "r", nil, "Map a source URL or domain to a routable local target; repeatable (source,target).")
	c.Flags().BoolP("force", "f", false, "Skip validations (e.g. the running-environment check).")

	addAppEnvFlags(c)
	cfg := GetConfig()
	return appctx.Build(c,
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRun(runDevEnvSyncSQL)
}

func runDevEnvSyncSQL(cmd *cobra.Command, _ []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	// ResolveLocalSlug, not ResolveSlug: here @app.env names the PLATFORM
	// environment to export from, so it must not be rejected as a local target.
	slug, err := ResolveLocalSlug(cmd)
	if err != nil {
		return err
	}
	out := cmd.OutOrStdout()

	tables, _ := cmd.Flags().GetStringArray("table")
	siteIDs, _ := cmd.Flags().GetStringArray("site-id")
	wpcliCommand, _ := cmd.Flags().GetString("wpcli-command")
	configFile, _ := cmd.Flags().GetString("config-file")
	overrides, _ := cmd.Flags().GetStringArray("search-replace")
	liveCopy, err := sqlexport.ParseLiveCopyCLIOptions(configFile, tables, siteIDs, wpcliCommand)
	if err != nil {
		return err
	}

	domain := compose.DefaultDomain
	if d, derr := instancedata.Read(slug); derr == nil && d.Domain != "" {
		domain = d.Domain
	}

	appID := ae.App.ID
	envID := ae.Env.ID

	// exportTo runs the M7 platform export to a temporary .gz next to dest, then
	// gunzips it to dest (the plain SQL file the sync orchestration consumes).
	// Mirrors Node generateExport + unzipFile (dev-env-sync-sql.ts:184,418).
	exportTo := func(ctx context.Context, dest string) error {
		pt := tui.NewProgressTracker(sqlexport.Steps())
		renderer := startImportProgressRenderer(cmd, pt)
		defer renderer.stop(cmd, false)

		gzPath := dest + ".gz"
		// Ignore the saved-path return: the export lands in a temp file the
		// user never sees, and printing "File saved to" here would interleave
		// with the still-running progress renderer (the duplicated-line bug).
		_, rerr := sqlexport.Run(gql.WithAllowGQLErrors(ctx), pt, sqlexport.Options{
			OutputFile:     gzPath,
			LiveCopy:       liveCopy,
			Interval:       exportPollInterval(),
			AppID:          appID,
			AppName:        ae.App.Name,
			EnvUniqueLabel: ae.Env.UniqueLabel,
		}, buildExportDeps(cmd, appID, envID, out), out)
		renderer.stop(cmd, true)
		if rerr != nil {
			return rerr
		}

		fmt.Fprintf(out, "Extracting the exported file %s...\n", gzPath)
		if uerr := gunzipFile(gzPath, dest); uerr != nil {
			return fmt.Errorf("Error extracting the SQL export: %s", uerr.Error())
		}
		fmt.Fprintf(out, "%s Extracted to %s\n", color.GreenString("✓"), dest)
		return nil
	}

	baseHost := slug + "." + domain
	deps := devenv.SyncDeps{
		ExportTo: exportTo,
		FetchSites: func(ctx context.Context) ([]devenv.SyncSite, string) {
			return fetchDevEnvSyncSites(ctx, cfg.GQLClient, appID, envID, func(line string) {
				fmt.Fprintln(out, line)
			})
		},
		ResolveDraft: func(draft devenv.PlanDraft) ([]string, error) {
			return resolveSyncMappings(cmd, draft, baseHost)
		},
		ImportFile: func(ctx context.Context, slug, file string, pairs []string) error {
			// Node runImport: inPlace + skipValidate + quiet (dev-env-sync-sql.ts:333).
			// The same DevEnvImportSQLCommand.run() Node uses here, so sync also
			// gets the post-import steps (cache flush / reindex / vipgo admin
			// user / data cleanup) — without them a synced env locks the user
			// out of their own local wp-admin.
			return devenv.ImportSQL(ctx, slug, file, devenv.ImportOptions{
				SearchReplace: pairs,
				InPlace:       true,
				SkipValidate:  true,
				Quiet:         true,
				// Node's sync search-replaces the export itself and passes no
				// searchReplace to the import, so it never reaches the
				// irreversible-rewrite prompt. Go routes the pairs through
				// ImportSQL, so pre-confirm the way Node's batchMode does —
				// the file is a temp export, not anything the user named.
				BatchMode: true,
				Out:       out,
			})
		},
		RepairDomains: devenv.RepairBlogDomains,
		RefreshHosts:  devenv.RefreshManagedHosts,
		Log: func(msg string) {
			fmt.Fprintln(out, msg)
		},
	}
	return devenv.SyncSQL(cmd.Context(), devenv.SyncOptions{
		Slug:        slug,
		Domain:      domain,
		IsMultisite: ae.Env.IsMultisite,
		Overrides:   overrides,
	}, deps)
}

type syncMappingInput func(*cobra.Command, string, string) (string, error)

func suggestedSyncTarget(source, baseHost string, index int) string {
	host := source
	if slash := strings.IndexByte(host, '/'); slash >= 0 {
		host = host[:slash]
	}
	if colon := strings.LastIndexByte(host, ':'); colon >= 0 {
		host = host[:colon]
	}
	var label strings.Builder
	lastHyphen := false
	for _, char := range strings.ToLower(host) {
		if char >= 'a' && char <= 'z' || char >= '0' && char <= '9' {
			label.WriteRune(char)
			lastHyphen = false
			continue
		}
		if !lastHyphen {
			label.WriteByte('-')
			lastHyphen = true
		}
	}
	readable := strings.Trim(label.String(), "-")
	if readable == "" {
		readable = "site"
	}
	suffix := fmt.Sprintf("-r%d", index+1)
	if limit := 63 - len(suffix); len(readable) > limit {
		readable = strings.TrimRight(readable[:limit], "-")
	}
	return readable + suffix + "." + baseHost
}

func resolveSyncMappingsCore(
	cmd *cobra.Command,
	draft devenv.PlanDraft,
	baseHost string,
	interactive bool,
	input syncMappingInput,
) ([]string, error) {
	if len(draft.Unresolved) == 0 {
		return nil, nil
	}
	if !interactive {
		var message strings.Builder
		message.WriteString("Multisite URL mappings remain unresolved; no SQL was imported. Re-run with these recovery flags (edit targets if needed):\n")
		for index, mapping := range draft.Unresolved {
			target := suggestedSyncTarget(mapping.Source, baseHost, index)
			fmt.Fprintf(&message, "- %s\n  -r \"%s,%s\"\n", mapping.Source, mapping.Source, target)
		}
		return nil, errors.New(strings.TrimRight(message.String(), "\n"))
	}
	if input == nil {
		return nil, errors.New("interactive sync mapping input is not configured")
	}
	pairs := make([]string, 0, len(draft.Unresolved))
	for index, mapping := range draft.Unresolved {
		fallback := suggestedSyncTarget(mapping.Source, baseHost, index)
		target, err := input(cmd, fmt.Sprintf("Local target for %s", mapping.Source), fallback)
		if err != nil || strings.TrimSpace(target) == "" {
			return nil, devenv.ErrSyncCancelled
		}
		pairs = append(pairs, mapping.Source+","+strings.TrimSpace(target))
	}
	return pairs, nil
}

func resolveSyncMappings(cmd *cobra.Command, draft devenv.PlanDraft, baseHost string) ([]string, error) {
	return resolveSyncMappingsCore(cmd, draft, baseHost, appctx.IsInteractive(cmd), appctx.Input)
}

// gunzipFile decompresses a gzip file at src into dest.
func gunzipFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	gz, err := gzip.NewReader(in)
	if err != nil {
		return err
	}
	defer gz.Close()
	outFile, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer outFile.Close()
	if _, err := io.Copy(outFile, gz); err != nil { // #nosec G110 -- trusted platform export
		return err
	}
	return nil
}

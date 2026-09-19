package commands

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	json "encoding/json/v2"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/httpproxy"
	"github.com/Automattic/vip/internal/mediaimport"
	"github.com/Automattic/vip/internal/redact"
	"github.com/Automattic/vip/internal/siteimport"
	"github.com/Automattic/vip/internal/upload"
)

// mediaImportAPIVersion — API_VERSION (vip-import-media.js:21).
const mediaImportAPIVersion = "v2"

// ImportMediaCmd returns `vip import media <file|url>`.
//
// Node parity: src/bin/vip-import-media.js. URL or local archive
// (.tar.gz/.tgz/.zip); local archives upload via internal/upload and the
// platform fetches the resulting presigned GetObject URL. Invalid
// input prints a red error block and exits 0 (js:158-176).
func ImportMediaCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "media <file|url>",
		Short: "Import media files into an environment",
		Long: "Import an archive of media files (.tar.gz, .tgz, .zip) from a local path or a publicly " +
			"accessible URL into a VIP Platform environment. The command polls the import status until completion.",
		Args: cobra.ExactArgs(1),
	}
	cmd.Flags().Bool("exportFileErrorsToJson", false, "Format the error log in JSON. Default is TXT.")
	cmd.Flags().StringP("saveErrorLog", "s", "", "Skip the confirmation prompt and download an error log for the import automatically.")
	cmd.Flags().BoolP("overwriteExistingFiles", "o", false, "Overwrite existing files with the imported files if they have the same path and file name.")
	cmd.Flags().BoolP("importIntermediateImages", "i", false, "Include intermediate image files in the import.")

	addAppEnvFlags(cmd)
	addSkipConfirmationWithForceAlias(cmd)
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithSkipConfirmationFlag(cmd),
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
		appctx.WithRequireConfirm(cmd, importMediaConfirmMessage(), importMediaConfirmPayload),
	).WithRun(runImportMedia)
}

// importMediaConfirmMessage — the requireConfirm block from
// vip-import-media.js:108.
func importMediaConfirmMessage() string {
	bold := color.New(color.FgRed, color.Bold)
	return "\n" + bold.Sprint("NOTE: If the provided archive's directory structure contains an `uploads/` directory,") +
		"\n" + bold.Sprint("only the files present inside that directory will be imported and the rest will be ignored.") +
		"\n" + bold.Sprint("If no `uploads/` directory is found, all files will be imported, as is.") +
		"\n\nAre you sure you want to import the contents of the URL?\n"
}

// isSupportedMediaURL ports isSupportedUrl (vip-import-media.js:91).
func isSupportedMediaURL(urlToTest string) bool {
	u, err := url.Parse(urlToTest)
	if err != nil {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}

func runImportMedia(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	out := cmd.OutOrStdout()
	fileNameOrURL := args[0]

	exportJSON, _ := cmd.Flags().GetBool("exportFileErrorsToJson")
	// Node negotiates --saveErrorLog into exactly "true"/"false"/"prompt"
	// for module 'import-media' BEFORE the handler runs (command.js:829-837),
	// which is also why an absent flag still prompts. See
	// negotiateSaveErrorLog in import_media_confirm.go.
	rawSaveErrorLog, _ := cmd.Flags().GetString("saveErrorLog")
	saveErrorLog := negotiateSaveErrorLog(rawSaveErrorLog)
	overwriteExistingFiles, _ := cmd.Flags().GetBool("overwriteExistingFiles")
	importIntermediateImages, _ := cmd.Flags().GetBool("importIntermediateImages")

	archiveURL := ""
	sourceIsLocal := false

	if strings.HasPrefix(fileNameOrURL, "http://") || strings.HasPrefix(fileNameOrURL, "https://") {
		archiveURL = fileNameOrURL
		if !isSupportedMediaURL(archiveURL) {
			// js:158-163 — red block, exit 0. Whitespace verbatim.
			fmt.Fprintln(out, color.RedString("\n\t Error:\n\t Invalid URL provided: "+archiveURL+
				"\n\t Please make sure that it is a publicly accessible web URL containing an archive of the media files to import."))
			return nil
		}
	} else {
		if !mediaimport.IsLocalArchive(fileNameOrURL) {
			// js:169-174 — red block, exit 0.
			fmt.Fprintln(out, color.RedString("\n\t Error:\n\t Invalid local archive provided: "+fileNameOrURL+
				"\n\t Please make sure the file exists and is one of: .tar.gz, .tgz, .zip"))
			return nil
		}

		sourceIsLocal = true
		meta, err := upload.GetFileMeta(fileNameOrURL)
		if err != nil {
			return err
		}
		uc := &upload.Client{APIHost: cfg.APIHost, Token: cfg.Token}
		lastProgress := ""
		res, err := uc.UploadImportFile(cmd.Context(), ae.App.ID, ae.Env.ID, meta, "md5",
			func(pct string) {
				// js:191-197 — only rewrite the line when the value changed.
				if pct == lastProgress {
					return
				}
				lastProgress = pct
				fmt.Fprintf(out, "\rUpload progress: %s   ", pct)
			})
		if err != nil {
			return err
		}
		fmt.Fprint(out, "\n")

		pre, err := uc.GetSignedUploadRequestData(cmd.Context(), upload.SignedRequestArgs{
			Action: "GetObject", AppID: ae.App.ID, EnvID: ae.Env.ID, BaseName: res.Meta.BaseName,
		})
		if err != nil {
			return err
		}
		archiveURL = pre.URL
	}

	trackEvent("import_media_start_execute", nil)

	tracker := mediaimport.NewTracker()
	tracker.SetPrefix("\n=============================================================\nImporting Media into your App...\n")

	// Banner (js:231-237). Domain comes from the env-info query (Node's
	// appQuery carried primaryDomain).
	domain := mediaPrimaryDomain(cmd.Context(), ae)
	fmt.Fprintln(out)
	if sourceIsLocal {
		fmt.Fprintf(out, "Importing local archive: %s (uploaded to temporary URL)\n", fileNameOrURL)
	} else {
		fmt.Fprintf(out, "Importing archive from: %s\n", archiveURL)
	}
	fmt.Fprintf(out, "to: %s (%s)\n", domain, formatEnvironment(ae.Env.Type))

	appID := ae.App.ID
	envID := ae.Env.ID
	input := &gql.AppEnvironmentStartMediaImportInput{
		ApplicationId:            appID,
		EnvironmentId:            envID,
		ArchiveUrl:               archiveURL,
		OverwriteExistingFiles:   &overwriteExistingFiles,
		ImportIntermediateImages: &importIntermediateImages,
	}
	apiVersion := mediaImportAPIVersion
	input.ApiVersion = &apiVersion

	if _, err := gql.StartMediaImport(gql.WithAllowGQLErrors(cmd.Context()), cfg.GQLClient, input); err != nil {
		// js:262-268 — print each GraphQL error and exit 0.
		fmt.Fprintln(out, color.RedString("Error:"), err.Error())
		trackEvent("import_media_start_execute_error", map[string]any{"error": "Error: " + err.Error()})
		return nil
	}

	return mediaImportCheckStatusCmd(cmd, tracker, ae, exportJSON, saveErrorLog)
}

// mediaPrimaryDomain fetches the env's primary domain name (the Node
// appQuery includes primaryDomain; our resolver doesn't, so reuse the
// import-sql env-info query). Falls back to "N/A".
func mediaPrimaryDomain(ctx context.Context, ae *appctx.AppEnv) string {
	cfg := GetConfig()
	if info, err := fetchImportEnvInfo(gql.WithAllowGQLErrors(ctx), cfg.GQLClient, ae.App.ID, ae.Env.ID); err == nil &&
		info.PrimaryDomainName != "" {
		return info.PrimaryDomainName
	}
	return "N/A"
}

// mediaPollInterval — VIP_IMPORT_MEDIA_INTERVAL_MS overrides the 1s Node
// default for tests.
func mediaPollInterval() time.Duration {
	if v := os.Getenv("VIP_IMPORT_MEDIA_INTERVAL_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return mediaimport.DefaultPollInterval
}

// mediaImportCheckStatusCmd ports mediaImportCheckStatus (status.ts:158):
// poll to a terminal state, render the Status/App suffix block, then run
// the error-log download flow. Returns nil on COMPLETED/ABORTED (exit 0)
// and an error on FAILED (exit 1, status.ts:384).
func mediaImportCheckStatusCmd(cmd *cobra.Command, tracker *mediaimport.Tracker, ae *appctx.AppEnv, exportJSON bool, saveErrorLog string) error {
	cfg := GetConfig()
	pollCtx := gql.WithAllowGQLErrors(cmd.Context())

	fetch := func(ctx context.Context) (*mediaimport.Status, error) {
		appID := ae.App.ID
		envID := ae.Env.ID
		resp, err := gql.MediaImportProgress(ctx, cfg.GQLClient, &appID, &envID)
		if err != nil {
			return nil, err
		}
		if resp == nil || resp.App == nil || len(resp.App.Environments) == 0 || resp.App.Environments[0] == nil {
			// status.ts:75.
			return nil, errors.New("Unable to determine import status from environment")
		}
		mis := resp.App.Environments[0].MediaImportStatus
		if mis == nil {
			return nil, nil
		}
		st := &mediaimport.Status{}
		if mis.ImportId != nil {
			st.ImportID = *mis.ImportId
		}
		if mis.SiteId != nil {
			st.SiteID = *mis.SiteId
		}
		if mis.Status != nil {
			st.Status = *mis.Status
		}
		if mis.FilesTotal != nil {
			st.FilesTotal = *mis.FilesTotal
		}
		if mis.FilesProcessed != nil {
			st.FilesProcessed = *mis.FilesProcessed
			st.HasFilesProcessed = true
		}
		if fd := mis.FailureDetails; fd != nil {
			det := &mediaimport.FailureDetails{}
			if fd.PreviousStatus != nil {
				det.PreviousStatus = *fd.PreviousStatus
			}
			for _, g := range fd.GlobalErrors {
				if g != nil {
					det.GlobalErrors = append(det.GlobalErrors, *g)
				}
			}
			if fd.FileErrorsUrl != nil {
				det.FileErrorsURL = *fd.FileErrorsUrl
			}
			st.FailureDetails = det
		}
		return st, nil
	}

	setSuffix := func(overall string) {
		// status.ts:178-207. The spinner glyph in the suffix uses the
		// first frame; the tracker's own line animates.
		sprite := mediaimport.GlyphForMediaStatus(overall, "⠋")
		var statusMessage string
		switch overall {
		case "INITIALIZING":
			statusMessage = fmt.Sprintf("INITIALIZING %s : We're downloading the files to be imported...", sprite)
		case "COMPLETED":
			statusMessage = fmt.Sprintf("COMPLETED %s : The imported files should be visible on your App", sprite)
		default:
			statusMessage = fmt.Sprintf("%s %s", siteimport.Capitalize(overall), sprite)
		}
		maybeExitPrompt := "(Press ^C to hide progress. The import will continue in the background.)"
		if overall == "COMPLETED" || overall == "ABORTED" || overall == "FAILED" {
			maybeExitPrompt = ""
		}
		tracker.SetSuffix(fmt.Sprintf("\n=============================================================\nStatus: %s\nApp: %s (%s)\n=============================================================\n%s\n",
			statusMessage, ae.App.Name, formatEnvironment(ae.Env.Type), maybeExitPrompt))
	}
	setSuffix("Checking...")

	renderer := startImportProgressRenderer(cmd, tracker)
	defer renderer.stop(cmd, false)

	res, err := mediaimport.CheckStatus(pollCtx, mediaimport.CheckStatusOpts{
		Fetch:    fetch,
		Tracker:  tracker,
		Interval: mediaPollInterval(),
		OnPoll:   setSuffix,
	})
	if err != nil {
		var fe *mediaimport.MediaImportError
		if errors.As(err, &fe) {
			renderer.stop(cmd, true)
			return errors.New(mediaimport.BuildErrorMessage(fe))
		}
		renderer.stop(cmd, true)
		return err
	}

	overall := res.Status
	setSuffix(overall)

	if res.FailureDetails != nil && res.FailureDetails.FileErrorsURL != "" {
		if err := promptFailureDetailsDownload(cmd, tracker, ae.App.Name, res.FailureDetails.FileErrorsURL, exportJSON, saveErrorLog); err != nil {
			renderer.stop(cmd, true)
			return err
		}
	} else if overall != "ABORTED" {
		// status.ts:347-358 — report-link-expired notice.
		if res.FilesTotal > 0 && res.HasFilesProcessed && res.FilesTotal != res.FilesProcessed {
			errorsFound := res.FilesTotal - res.FilesProcessed
			tracker.AppendSuffix(color.YellowString(
				fmt.Sprintf("⚠️  %d error(s) were found. File import errors report link expired.", errorsFound)))
		}
	}

	renderer.stop(cmd, true)
	return nil
}

// fetchFailureDetails downloads and parses the media-import file-errors report
// (Node: fetchFailureDetails, src/lib/media-import/status.ts:296).
//
// Two things make this call site need more care than a plain GET.
//
// The URL is presigned — its query string IS the download credential — and
// net/http embeds the full request URL in every *url.Error it returns. That
// error propagates to exit.WithError and from there to the Go-only cli_error
// telemetry hook, which posts to public-api.wordpress.com. A failed fetch was
// therefore shipping a live credential for a customer's error report off-box.
// redact.Text removes the query while keeping host and path, so the message
// still says what failed and where.
//
// The URL is also entirely server-provided, so the response is treated as
// untrusted input: the body is read through a limit reader rather than straight
// into memory, and a non-2xx status is reported as a status rather than handed
// to the JSON parser (where an S3 XML error body surfaces as the useless
// "invalid character '<'").
func fetchFailureDetails(fileErrorsURL string) ([]mediaimport.FileError, error) {
	// Node uses a bare node-fetch here, which reads no proxy environment at
	// all. Go's default is not equivalent to that: it honours an ambient
	// HTTPS_PROXY without the VIP_USE_SYSTEM_PROXY opt-in while ignoring
	// VIP_PROXY. See internal/httpproxy.
	resp, err := httpproxy.Client().Get(fileErrorsURL) // #nosec G107 -- server-provided report URL
	if err != nil {
		return nil, errors.New(redact.Text(err.Error()))
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("import errors report returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxFailureReportBytes))
	if err != nil {
		return nil, errors.New(redact.Text(err.Error()))
	}

	var fileErrors []mediaimport.FileError
	if err := json.Unmarshal(body, &fileErrors); err != nil {
		return nil, err
	}
	return fileErrors, nil
}

// maxFailureReportBytes caps the untrusted error report. The largest real
// reports are a few MB of filenames; 256 MB is far past any of them and still
// bounds a malformed or hostile response.
const maxFailureReportBytes = 256 << 20

// promptFailureDetailsDownload ports promptFailureDetailsDownload
// (status.ts:313): 'prompt' asks; 'true'/'yes' downloads; anything else
// prints the 15-minute URL block.
func promptFailureDetailsDownload(cmd *cobra.Command, tracker *mediaimport.Tracker, appName, fileErrorsURL string, exportJSON bool, saveErrorLog string) error {
	download := false
	if saveErrorLog == "prompt" {
		ok, err := importConfirmPrompt(cmd,
			"Download import errors report now? (Report will be downloadable for up to 7 days from the completion of the import)", false)
		download = err == nil && ok
	} else {
		download = saveErrorLog == "true" || saveErrorLog == "yes"
	}

	if !download {
		// status.ts:327-338.
		tracker.AppendSuffix(color.YellowString("⚠️  An error report file has been generated for this media import. Access it within the next 15 minutes by clicking on the URL below."))
		tracker.AppendSuffix("\n" + color.YellowString("Or, generate a new URL by running the "+
			color.New(color.BgYellow).Sprint("vip import media status")+" command.") + " ")
		tracker.AppendSuffix("\n" + color.YellowString("The report will be downloadable for up to 7 days after the completion of the import or until a new media import is performed."))
		tracker.AppendSuffix("\n\n" + color.New(color.Underline).Sprint(fileErrorsURL) + "\n")
		return nil
	}

	// fetchFailureDetails (status.ts:296).
	tracker.AppendSuffix(fmt.Sprintf("\n=============================================================\nDownloading errors details from %s\n\n", fileErrorsURL))
	fileErrors, err := fetchFailureDetails(fileErrorsURL)
	if err != nil {
		tracker.AppendSuffix(color.RedString("Could not download import errors report\n" + err.Error()))
		return err
	}

	// exportFailureDetails (status.ts:277).
	formatted := mediaimport.BuildFileErrors(fileErrors, exportJSON)
	ext := ".txt"
	if exportJSON {
		ext = ".json"
	}
	errorsFile := fmt.Sprintf("media-import-%s-%d%s", appName, time.Now().UnixMilli(), ext)
	if err := os.WriteFile(errorsFile, []byte(formatted), 0o600); err != nil {
		tracker.AppendSuffix(color.RedString("Could not export errors to file\n" + err.Error()))
		return nil
	}
	abs, err := filepath.Abs(errorsFile)
	if err != nil {
		abs = errorsFile
	}
	tracker.AppendSuffix(color.YellowString("⚠️  All errors have been exported to " +
		color.New(color.Bold).Sprint(abs) + "\n"))
	return nil
}

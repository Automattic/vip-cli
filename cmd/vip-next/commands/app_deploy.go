package commands

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/Khan/genqlient/graphql"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/Automattic/vip/internal/customdeploy"
	"github.com/Automattic/vip/internal/debuglog"
	"github.com/Automattic/vip/internal/envalias"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/tui"
	"github.com/Automattic/vip/internal/upload"
)

// AppDeployCmd returns `vip app deploy <file>`.
//
// Node parity: src/bin/vip-app-deploy.ts. Custom Deployment authenticates
// with WPVIP_DEPLOY_TOKEN — never the keychain token — for both the
// access-validation and start-deploy mutations (custom-deploy.ts:56,
// vip-app-deploy.ts:216). No appctx resolution: --app/--env raw values
// go straight into ValidateCustomDeployAccess.
func AppDeployCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "deploy <file>",
		Short: "Deploy a local archived file to an environment with Custom Deployment enabled",
		Long: "Deploy a local archived file (.zip, .tar.gz, .tgz) that contains application code to a " +
			"VIP Platform environment that has Custom Deployment enabled. Requires WPVIP_DEPLOY_TOKEN.",
		Args: cobra.ExactArgs(1),
		RunE: runAppDeploy,
	}
	// src/bin/vip-app-deploy.ts registers message/skip-confirmation/force/app/env
	// in that order; the shorts follow from createOptionDefinition.
	cmd.Flags().StringP("message", "m", "", "Add a description of a deployment.")
	cmd.Flags().BoolP("skip-confirmation", "s", false, "Skip the confirmation prompt.")
	cmd.Flags().BoolP("force", "f", false, "Skip confirmation prompt (deprecated)")
	addAppEnvFlags(cmd)
	cmd.Flags().StringArrayP("to", "t", nil,
		"Deploy to an environment in the format app-name.environment-name. Repeat the option or separate values with commas to deploy to multiple environments.")
	cmd.Example = "  WPVIP_DEPLOY_TOKEN=1234 vip app deploy file.tar.gz --to=example-app.production --to=other-app.develop\n" +
		"  WPVIP_DEPLOY_TOKEN=1234 vip app deploy file.tar.gz --to=example-app.production,other-app.develop"
	return cmd
}

var errInvalidDeployKey = errors.New("Unauthorized: Invalid or non-existent custom deploy key for environment.")

// deployKeyError keeps the API's own message for a failed
// validateCustomDeployAccess call. Ports describeCustomDeployKeyError
// (custom-deploy.ts).
func deployKeyError(err error) error {
	var list gqlerror.List
	if !errors.As(err, &list) || len(list) == 0 {
		return err
	}
	messages := make([]string, len(list))
	for i, item := range list {
		messages[i] = item.Message
	}
	return errors.New(strings.Join(messages, "; "))
}

// deployKeyCheck is the result of checking the deploy key against one target.
type deployKeyCheck struct {
	label string
	info  *customdeploy.DeployInfo
	err   error
}

// validateDeployTargets ports validateDeployTargets (vip-app-deploy.ts): it
// checks the deploy key against every target before touching any of them and,
// if any is rejected, fails with a per-environment summary. The same
// environment addressed twice (name and ID) is returned once.
func validateDeployTargets(ctx context.Context, client graphql.Client, targets []deployTarget) ([]*customdeploy.DeployInfo, error) {
	checks := make([]deployKeyCheck, len(targets))
	var firstErr error
	for i, t := range targets {
		info, err := validateCustomDeployKey(ctx, client, t.app, t.env)
		checks[i] = deployKeyCheck{label: t.label(), info: info, err: err}
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if firstErr != nil {
		if len(targets) == 1 {
			return nil, firstErr
		}
		return nil, errors.New(formatDeployKeySummary(checks))
	}

	var infos []*customdeploy.DeployInfo
	seenEnvIDs := map[int64]bool{}
	for _, c := range checks {
		if !seenEnvIDs[c.info.EnvID] {
			seenEnvIDs[c.info.EnvID] = true
			infos = append(infos, c.info)
		}
	}
	return infos, nil
}

// formatDeployKeySummary ports formatDeployKeySummary (vip-app-deploy.ts).
func formatDeployKeySummary(checks []deployKeyCheck) string {
	failed := 0
	lines := make([]string, len(checks))
	for i, c := range checks {
		if c.err != nil {
			failed++
			lines[i] = fmt.Sprintf("  ✕ %s: %s", c.label, c.err.Error())
		} else {
			lines[i] = "  ✓ " + c.label
		}
	}
	return fmt.Sprintf("The deploy key could not be validated for %d of %d environments:\n%s",
		failed, len(checks), strings.Join(lines, "\n"))
}

const (
	deployTargetFormatError   = "Invalid --to value. Targets are in the format of app-name.environment-name (e.g. example-app.production)."
	deployTargetConflictError = "The --to option cannot be used with --app, --env, or an @app.env alias."
)

// deployTarget is one environment named on the command line.
type deployTarget struct {
	app, env string
}

func (t deployTarget) label() string { return t.app + "." + t.env }

// parseDeployTargets ports parseDeployTargets (vip-app-deploy.ts). Without
// --to the single --app/--env (or @app.env alias) pair is used.
func parseDeployTargets(cmd *cobra.Command) ([]deployTarget, error) {
	appFlag := lookupRootFlag(cmd, "app")
	envFlag := lookupRootFlag(cmd, "env")

	f := cmd.Flags().Lookup("to")
	if f == nil || !f.Changed {
		return []deployTarget{{app: appFlag, env: envFlag}}, nil
	}
	if appFlag != "" || envFlag != "" {
		return nil, errors.New(deployTargetConflictError)
	}

	raw, _ := cmd.Flags().GetStringArray("to")
	var targets []deployTarget
	seen := map[string]bool{}
	for _, value := range raw {
		for _, part := range strings.Split(value, ",") {
			// Same grammar as the @app.env alias, minus the "@".
			app, env, ok := envalias.Parse("@" + strings.TrimSpace(part))
			if !ok || app == "" || env == "" {
				return nil, errors.New(deployTargetFormatError)
			}
			t := deployTarget{app: app, env: env}
			if seen[t.label()] {
				continue
			}
			seen[t.label()] = true
			targets = append(targets, t)
		}
	}
	// pflag reads `--to=""` back as an empty array, so no part was checked.
	if len(targets) == 0 {
		return nil, errors.New(deployTargetFormatError)
	}
	return targets, nil
}

// deployGQLClient builds a genqlient client that authenticates with the
// deploy token instead of the keychain token, reusing the standard
// middleware chain.
func deployGQLClient(cfg Config, deployToken string) graphql.Client {
	httpClient := gql.HTTPClientWithMiddleware(cfg.APIHost, deployToken, cfg.Middleware)
	return graphql.NewClient(cfg.APIHost+"/graphql", httpClient)
}

// validateCustomDeployKey ports validateCustomDeployKey
// (custom-deploy.ts:28).
func validateCustomDeployKey(ctx context.Context, client graphql.Client, app, env string) (*customdeploy.DeployInfo, error) {
	resp, err := gql.ValidateCustomDeployAccess(gql.WithAllowGQLErrors(ctx), client,
		&gql.ValidateCustomDeployAccessInput{App: app, Env: env})
	if err != nil {
		return nil, deployKeyError(err)
	}
	if resp == nil || resp.ValidateCustomDeployAccess == nil {
		return nil, errInvalidDeployKey
	}
	v := resp.ValidateCustomDeployAccess
	info := &customdeploy.DeployInfo{}
	if v.AppId != nil {
		info.AppID = *v.AppId
	}
	if v.EnvId != nil {
		info.EnvID = *v.EnvId
	}
	if v.EnvType != nil {
		info.EnvType = *v.EnvType
	}
	if v.EnvUniqueLabel != nil {
		info.EnvUniqueLabel = *v.EnvUniqueLabel
	}
	if v.PrimaryDomainName != nil {
		info.PrimaryDomainName = *v.PrimaryDomainName
	}
	if v.Launched != nil {
		info.Launched = *v.Launched
	}
	return info, nil
}

func runAppDeploy(cmd *cobra.Command, args []string) error {
	cfg := GetConfig()
	out := cmd.OutOrStdout()
	fileName := args[0]

	message, _ := cmd.Flags().GetString("message")
	skipConfirmation, _ := cmd.Flags().GetBool("skip-confirmation")
	force, _ := cmd.Flags().GetBool("force")
	skipConfirm := skipConfirmation || force

	targets, err := parseDeployTargets(cmd)
	if err != nil {
		return err
	}

	meta, err := upload.GetFileMeta(fileName)
	if err != nil {
		return fmt.Errorf("Unable to access file %s", fileName)
	}

	debuglog.Printf(cmd.Context(), "@automattic/vip:bin:vip-app-deploy", "Validating custom deploy key...")
	deployToken := os.Getenv("WPVIP_DEPLOY_TOKEN")
	if deployToken == "" {
		// custom-deploy.ts:33.
		return errors.New("Valid custom deploy key is required.")
	}

	client := deployGQLClient(cfg, deployToken)

	infos, err := validateDeployTargets(cmd.Context(), client, targets)
	if err != nil {
		return err
	}
	multi := len(infos) > 1
	// The archive is uploaded once, to the first target; the API builds
	// every target from it (vip-go-api#8478).
	info := infos[0]

	debuglog.Printf(cmd.Context(), "@automattic/vip:bin:vip-app-deploy", "Validating file...")
	if err := customdeploy.ValidateFile(meta, 0); err != nil {
		trackEvent("deploy_app_command_error", map[string]any{"error_type": "invalid-file"})
		return err
	}

	// One event per environment, matching Node's per-target tracking.
	for range infos {
		trackEvent("deploy_app_command_execute", nil)
	}

	// Date-prefix the basename to avoid overwriting same-named files
	// (vip-app-deploy.ts:101-106).
	datePrefix := time.Now().UTC().Format("20060102150405")
	meta.BaseName = datePrefix + "-" + meta.BaseName

	// Confirm every target up front so nothing deploys unless all are confirmed.
	if !skipConfirm {
		for _, ti := range infos {
			launchedLabel := "un-launched"
			if ti.Launched {
				launchedLabel = "launched"
			}
			promptToMatch := strings.ToUpper(ti.PrimaryDomainName)
			// vip-app-deploy.ts:66 — note "site" wording and "un-launched"
			// (hyphenated, unlike import sql's "unlaunched").
			promptMsg := fmt.Sprintf("You are about to deploy to a %s %s site %s.\nType '%s' (without the quotes) to continue:\n",
				launchedLabel, formatEnvironment(ti.EnvType),
				color.YellowString(ti.PrimaryDomainName), color.YellowString(promptToMatch))
			answer, perr := importInputPrompt(cmd, promptMsg, "")
			if perr != nil || strings.ToUpper(answer) != promptToMatch {
				trackEvent("deploy_app_unexpected_input", nil)
				return errors.New("The input did not match the expected environment label. Deploy aborted.")
			}
		}
	}

	destination := "your environment"
	if multi {
		destination = fmt.Sprintf("%d environments", len(infos))
	}

	// ===== progress phase; no stray prints below (js:122 WARNING) =====
	pt := tui.NewProgressTracker([]tui.ProgressStep{
		{ID: "upload", Name: "Uploading file"},
		{ID: "deploy", Name: "Triggering deployment"},
	})
	pt.SetPrefix("\n=============================================================\nProcessing the file for deployment to " + destination + "...\n")
	pt.SetSuffix("\n" + tui.GlyphForStatus(tui.StepRunning, tui.SpinnerGlyphs[0]) + " Running...")
	renderer := startImportProgressRenderer(cmd, pt)
	defer renderer.stop(cmd, false)

	failWithError := func(failureErr error) error {
		pt.SetSuffix("\n" + tui.GlyphForStatus(tui.StepFailed, tui.SpinnerGlyphs[0]) + " Running...")
		renderer.stop(cmd, true)
		return failureErr
	}

	_ = pt.StepRunning("upload")
	uc := &upload.Client{APIHost: cfg.APIHost, Token: deployToken}
	res, err := uc.UploadImportFile(cmd.Context(), info.AppID, info.EnvID, meta, "sha256",
		func(pct string) { pt.SetUploadPercentage(pct) })
	if err != nil {
		trackEvent("deploy_app_command_error", map[string]any{
			"error_type": "upload_failed", "upload_error": err.Error(),
		})
		_ = pt.StepFailed("upload")
		return failWithError(err)
	}
	debuglog.Printf(cmd.Context(), "@automattic/vip:bin:vip-app-deploy", "Upload complete. Initiating the deploy.")
	_ = pt.StepSuccess("upload")
	trackEvent("deploy_app_upload_complete", nil)

	// StartCustomDeploy uses the date-prefixed basename, NOT the
	// (possibly .gz-renamed) upload basename — Node passes
	// fileMeta.basename as captured before upload (vip-app-deploy.ts:187).
	basename := meta.BaseName
	checksum := res.Checksum
	input := &gql.AppEnvironmentCustomDeployInput{
		Id:            &info.AppID,
		Basename:      &basename,
		Checksum:      &checksum,
		DeployMessage: &message,
	}
	// Single-target deploys keep the original environmentId contract.
	if multi {
		for _, ti := range infos {
			input.EnvironmentIds = append(input.EnvironmentIds, ti.EnvID)
		}
	} else {
		input.EnvironmentId = &info.EnvID
	}
	if _, err := gql.StartCustomDeploy(gql.WithAllowGQLErrors(cmd.Context()), client, input); err != nil {
		trackEvent("deploy_app_command_error", map[string]any{"error_type": "StartDeploy-failed"})
		_ = pt.StepFailed("deploy")
		return failWithError(fmt.Errorf("StartDeploy call failed: %s", err.Error()))
	}
	_ = pt.StepSuccess("deploy")
	pt.SetSuffix("")
	renderer.stop(cmd, true)

	// Final success block (vip-app-deploy.ts).
	deploymentsURL := func(ti *customdeploy.DeployInfo) string {
		return fmt.Sprintf("https://dashboard.wpvip.com/apps/%d/%s/code/deployments", ti.AppID, ti.EnvUniqueLabel)
	}
	domainColor := color.New(color.Bold, color.FgBlue)
	sentTo := destination
	links := ": " + deploymentsURL(info)
	if multi {
		var lines []string
		for _, ti := range infos {
			lines = append(lines, fmt.Sprintf("  - %s: %s", domainColor.Sprint(ti.PrimaryDomainName), deploymentsURL(ti)))
		}
		links = ":\n" + strings.Join(lines, "\n")
	} else {
		sentTo = domainColor.Sprint(info.PrimaryDomainName)
	}
	fmt.Fprintf(out, "\n✅ %s has been sent for deployment to %s. \nTo check deployment status, go to %s%s\n",
		color.New(color.Bold, color.Underline, color.FgMagenta).Sprint(meta.BaseName),
		sentTo, color.New(color.Bold).Sprint("VIP Dashboard"), links)
	return nil
}

// lookupRootFlag reads the root-level persistent --app/--env values the
// deploy command consumes raw (Node: opts.app/opts.env).
func lookupRootFlag(cmd *cobra.Command, name string) string {
	if f := cmd.Flag(name); f != nil {
		return f.Value.String()
	}
	return ""
}

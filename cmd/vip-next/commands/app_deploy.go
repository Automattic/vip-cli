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

	"github.com/Automattic/vip/internal/customdeploy"
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
	return cmd
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
	if err != nil || resp == nil || resp.ValidateCustomDeployAccess == nil {
		return nil, errors.New("Unauthorized: Invalid or non-existent custom deploy key for environment.")
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

	meta, err := upload.GetFileMeta(fileName)
	if err != nil {
		return fmt.Errorf("Unable to access file %s", fileName)
	}

	deployToken := os.Getenv("WPVIP_DEPLOY_TOKEN")
	if deployToken == "" {
		// custom-deploy.ts:33.
		return errors.New("Valid custom deploy key is required.")
	}

	appFlag := lookupRootFlag(cmd, "app")
	envFlag := lookupRootFlag(cmd, "env")

	client := deployGQLClient(cfg, deployToken)
	info, err := validateCustomDeployKey(cmd.Context(), client, appFlag, envFlag)
	if err != nil {
		return err
	}

	if err := customdeploy.ValidateFile(meta, 0); err != nil {
		trackEvent("deploy_app_command_error", map[string]any{"error_type": "invalid-file"})
		return err
	}

	trackEvent("deploy_app_command_execute", nil)

	// Date-prefix the basename to avoid overwriting same-named files
	// (vip-app-deploy.ts:101-106).
	datePrefix := time.Now().UTC().Format("20060102150405")
	meta.BaseName = datePrefix + "-" + meta.BaseName

	if !skipConfirm {
		launchedLabel := "un-launched"
		if info.Launched {
			launchedLabel = "launched"
		}
		promptToMatch := strings.ToUpper(info.PrimaryDomainName)
		// vip-app-deploy.ts:66 — note "site" wording and "un-launched"
		// (hyphenated, unlike import sql's "unlaunched").
		promptMsg := fmt.Sprintf("You are about to deploy to a %s %s site %s.\nType '%s' (without the quotes) to continue:\n",
			launchedLabel, formatEnvironment(info.EnvType),
			color.YellowString(info.PrimaryDomainName), color.YellowString(promptToMatch))
		answer, perr := importInputPrompt(cmd, promptMsg, "")
		if perr != nil || strings.ToUpper(answer) != promptToMatch {
			trackEvent("deploy_app_unexpected_input", nil)
			return errors.New("The input did not match the expected environment label. Deploy aborted.")
		}
	}

	// ===== progress phase; no stray prints below (js:122 WARNING) =====
	pt := tui.NewProgressTracker([]tui.ProgressStep{
		{ID: "upload", Name: "Uploading file"},
		{ID: "deploy", Name: "Triggering deployment"},
	})
	pt.SetPrefix("\n=============================================================\nProcessing the file for deployment to your environment...\n")
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
	_ = pt.StepSuccess("upload")
	trackEvent("deploy_app_upload_complete", nil)

	// StartCustomDeploy uses the date-prefixed basename, NOT the
	// (possibly .gz-renamed) upload basename — Node passes
	// fileMeta.basename as captured before upload (vip-app-deploy.ts:187).
	basename := meta.BaseName
	checksum := res.Checksum
	input := &gql.AppEnvironmentCustomDeployInput{
		Id:            &info.AppID,
		EnvironmentId: &info.EnvID,
		Basename:      &basename,
		Checksum:      &checksum,
		DeployMessage: &message,
	}
	if _, err := gql.StartCustomDeploy(gql.WithAllowGQLErrors(cmd.Context()), client, input); err != nil {
		trackEvent("deploy_app_command_error", map[string]any{"error_type": "StartDeploy-failed"})
		_ = pt.StepFailed("deploy")
		return failWithError(fmt.Errorf("StartDeploy call failed: %s", err.Error()))
	}
	_ = pt.StepSuccess("deploy")
	pt.SetSuffix("")
	renderer.stop(cmd, true)

	// Final success block (vip-app-deploy.ts:240-249).
	deploymentsURL := fmt.Sprintf("https://dashboard.wpvip.com/apps/%d/%s/code/deployments", info.AppID, info.EnvUniqueLabel)
	fmt.Fprintf(out, "\n✅ %s has been sent for deployment to %s. \nTo check deployment status, go to %s: %s\n",
		color.New(color.Bold, color.Underline, color.FgMagenta).Sprint(meta.BaseName),
		color.New(color.Bold, color.FgBlue).Sprint(info.PrimaryDomainName),
		color.New(color.Bold).Sprint("VIP Dashboard"),
		deploymentsURL)
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

package commands

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/customdeploy"
	"github.com/Automattic/vip/internal/upload"
)

// AppDeployValidateCmd returns `vip app deploy validate <file>`.
//
// Node parity: src/bin/vip-app-deploy-validate.ts. Local-only: file
// gates + archive-structure validation, no network and no deploy token.
func AppDeployValidateCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "validate <file>",
		Short: "Validate the directory structure of an archived file",
		Long: "Validate the directory structure and contents of a local archived file (.zip, .tar.gz, " +
			".tgz) ahead of a Custom Deployment.",
		Args: cobra.ExactArgs(1),
		RunE: runAppDeployValidate,
	}
}

func runAppDeployValidate(cmd *cobra.Command, args []string) error {
	fileName := args[0]
	meta, err := upload.GetFileMeta(fileName)
	if err != nil {
		return fmt.Errorf("Unable to access file %s", fileName)
	}

	if err := customdeploy.ValidateFile(meta, 0); err != nil {
		return err
	}

	trackEvent("deploy_validate_app_command_execute", nil)

	// vip-app-deploy-validate.ts:42 — .zip goes through the zip
	// validator; everything else (tar.gz/tgz) through the tar validator.
	if strings.ToLower(filepath.Ext(fileName)) == ".zip" {
		err = customdeploy.ValidateZipFile(fileName)
	} else {
		err = customdeploy.ValidateTarFile(fileName)
	}
	if err != nil {
		return err
	}

	fmt.Fprintln(cmd.OutOrStdout(), color.GreenString("✓ Compressed file has been successfully validated with no errors."))
	return nil
}

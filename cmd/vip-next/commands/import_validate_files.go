package commands

import (
	"context"
	"fmt"
	"os"

	json "encoding/json/v2"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/validatefiles"
)

// ImportValidateFilesCmd returns `vip import validate-files <folder>`.
//
// Node parity: src/bin/vip-import-validate-files.js. Always exits 0 —
// findings are informational. Needs GraphQL only for the validation
// config (mediaImportConfig); no app/env context.
func ImportValidateFilesCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "validate-files <folder>",
		Short: "Validate the directory structure and contents of a local media directory",
		Long: "Validate the directory structure, file extensions, file names, and file sizes of a " +
			"local directory of media files against the WordPress VIP recommended structure " +
			"(`uploads/year/month`, or `uploads/sites/<siteID>/year/month` for multisites).",
		Args: cobra.ExactArgs(1),
		RunE: runImportValidateFiles,
	}
}

func runImportValidateFiles(cmd *cobra.Command, args []string) error {
	cfg := GetConfig()
	out := cmd.OutOrStdout()
	errW := cmd.ErrOrStderr()
	filePath := args[0]

	trackEvent("import_validate_files_command_execute", nil)

	fi, err := os.Stat(filePath)
	if err != nil || !fi.IsDir() {
		// js:33-39 — error to stderr, exit 0.
		fmt.Fprintln(errW, color.RedString("✕ Error:"),
			"The given path is not a directory. Provide a valid directory path.")
		return nil
	}

	// Folder walk (js:50). nil → walk error already printed; exit 0.
	nested := validatefiles.FindNestedDirectories(filePath, errW)
	if nested == nil {
		return nil
	}

	var folderValidation []string
	if len(nested.Folders) > 0 {
		folderValidation = validatefiles.FolderStructureValidation(nested.Folders, out)
	}

	if len(nested.Files) == 0 {
		// js:73-75 — prints but CONTINUES (bug-for-bug).
		fmt.Fprintln(errW, color.RedString("✕ Error:"), "The media files directory cannot be empty.")
	}

	// Media import config (js:80).
	mediaCfg, cfgErr := fetchMediaImportConfig(cmd, cfg)
	if cfgErr != nil || mediaCfg == nil {
		fmt.Fprintln(errW, color.RedString("✕ Error:"),
			"Could not retrieve validation metadata. Please contact VIP Support.")
		return nil
	}

	res := validatefiles.ValidateFiles(nested.Files, *mediaCfg)

	// Error logging (js:107-130).
	var allowedTypeKeys []string
	for k := range mediaCfg.AllowedFileTypes {
		allowedTypeKeys = append(allowedTypeKeys, k)
	}
	validatefiles.LogErrors(out, validatefiles.LogErrorsOptions{
		ErrorType: validatefiles.ErrInvalidTypes, InvalidFiles: res.ErrorFileTypes,
		AllowedTypes: allowedTypeKeys,
	})
	validatefiles.LogErrors(out, validatefiles.LogErrorsOptions{
		ErrorType: validatefiles.ErrInvalidSizes, InvalidFiles: res.ErrorFileSizes,
		Limit: mediaCfg.FileSizeLimitInBytes,
	})
	validatefiles.LogErrors(out, validatefiles.LogErrorsOptions{
		ErrorType: validatefiles.ErrInvalidNameCharCounts, InvalidFiles: res.ErrorFileNamesCharCount,
		Limit: mediaCfg.FileNameCharCount,
	})
	validatefiles.LogErrors(out, validatefiles.LogErrorsOptions{
		ErrorType: validatefiles.ErrInvalidNames, InvalidFiles: res.ErrorFileNames,
	})
	validatefiles.LogErrors(out, validatefiles.LogErrorsOptions{
		ErrorType:          validatefiles.ErrIntermediateImages,
		InvalidFiles:       validatefiles.SortedKeys(res.IntermediateImages),
		IntermediateImages: res.IntermediateImages,
	})

	// Summary (js:133-142).
	validatefiles.SummaryLogs(out, validatefiles.SummaryParams{
		FolderErrorsLength:            len(folderValidation),
		IntImagesErrorsLength:         res.IntermediateImagesTotal,
		FileTypeErrorsLength:          len(res.ErrorFileTypes),
		FileErrorFileSizesLength:      len(res.ErrorFileSizes),
		FilenameErrorsLength:          len(res.ErrorFileNames),
		FileNameCharCountErrorsLength: len(res.ErrorFileNamesCharCount),
		TotalFiles:                    len(nested.Files),
		TotalFolders:                  len(nested.Folders),
	})

	trackEvent("import_validate_files_command_success", map[string]any{
		"folder_errors_length":     len(folderValidation),
		"int_images_errors_length": res.IntermediateImagesTotal,
		"file_type_errors_length":  len(res.ErrorFileTypes),
		"filename_errors_length":   len(res.ErrorFileNames),
		"total_files":              len(nested.Files),
		"total_folders":            len(nested.Folders),
	})
	return nil
}

// fetchMediaImportConfig wraps gql.MediaImportConfig (media-import/
// config.ts:18) and flattens it into validatefiles.Config. The
// allowedFileTypes scalar arrives as raw JSON ({ext: label}).
func fetchMediaImportConfig(cmd *cobra.Command, cfg Config) (*validatefiles.Config, error) {
	// No appctx middleware on this command — cobra's Context() can be nil
	// when invoked directly (tests, legacy dispatch).
	ctx := cmd.Context()
	if ctx == nil {
		ctx = context.Background()
	}
	resp, err := gql.MediaImportConfig(gql.WithAllowGQLErrors(ctx), cfg.GQLClient)
	if err != nil {
		return nil, err
	}
	if resp == nil || resp.MediaImportConfig == nil {
		return nil, nil
	}
	mic := resp.MediaImportConfig
	out := &validatefiles.Config{AllowedFileTypes: map[string]string{}}
	if mic.FileNameCharCount != nil {
		out.FileNameCharCount = *mic.FileNameCharCount
	}
	if mic.FileSizeLimitInBytes != nil {
		out.FileSizeLimitInBytes = *mic.FileSizeLimitInBytes
	}
	if mic.AllowedFileTypes != nil && len(*mic.AllowedFileTypes) > 0 {
		// Strict decode of the {ext: label} scalar payload.
		if err := json.Unmarshal(*mic.AllowedFileTypes, &out.AllowedFileTypes); err != nil {
			return nil, err
		}
	}
	return out, nil
}

package commands

import (
	"errors"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/devenv"
)

// devenvImportSQL is the seam tests replace to observe the ImportOptions the
// cobra layer builds without touching Docker.
var devenvImportSQL = devenv.ImportSQL

func newDevEnvImportCmd() *cobra.Command {
	imp := &cobra.Command{Use: "import", Short: "Import data into a local environment"}
	imp.AddCommand(newDevEnvImportSQLCmd(), newDevEnvImportMediaCmd())
	return imp
}

func newDevEnvImportSQLCmd() *cobra.Command {
	var searchReplace []string
	var inPlace, skipValidate, skipReindex, quiet bool
	c := &cobra.Command{
		Use:           "sql <file>",
		Short:         "Import a SQL file into a local environment",
		Args:          cobra.ExactArgs(1),
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if args[0] == "" {
				return errors.New("you must pass a SQL file path")
			}
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			return devenvImportSQL(cmd.Context(), slug, args[0], devenv.ImportOptions{
				SearchReplace: searchReplace,
				InPlace:       inPlace,
				SkipValidate:  skipValidate,
				SkipReindex:   skipReindex,
				Quiet:         quiet,
				Out:           cmd.OutOrStdout(),
				// Hand the cobra command down so the irreversible --in-place
				// gate honours the --non-interactive FLAG, not just
				// VIP_NON_INTERACTIVE. internal/devenv has no command of its
				// own to give appctx.
				Confirm: func(message string, defaultYes bool) (bool, error) {
					return appctx.Confirm(cmd, message, defaultYes)
				},
			})
		},
	}
	addSlugFlag(c)
	c.Flags().StringArrayVarP(&searchReplace, "search-replace", "r", nil, `"from,to" replacement applied during import (repeatable).`)
	c.Flags().BoolVarP(&inPlace, "in-place", "i", false, "Search-replace the source SQL file in place (saves the changes).")
	// One flag, two effects — Node's own grouping (dev-env-import-sql.ts:83).
	c.Flags().BoolVar(&skipValidate, "skip-validate", false, "Skip the SQL file validation and the running-environment check.")
	c.Flags().BoolVarP(&skipReindex, "skip-reindex", "k", false, "Skip the Elasticsearch reindex after import.")
	c.Flags().BoolVarP(&quiet, "quiet", "q", false, "Skip confirmation and suppress informational messages.")
	return c
}

func newDevEnvImportMediaCmd() *cobra.Command {
	c := &cobra.Command{
		Use:           "media <directory>",
		Short:         "Import media files into a local environment",
		Args:          cobra.ExactArgs(1),
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if args[0] == "" {
				return errors.New("you must pass a media directory path")
			}
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			return devenv.ImportMedia(cmd.Context(), slug, args[0])
		},
	}
	addSlugFlag(c)
	return c
}

package commands

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/envvar"
	"github.com/Automattic/vip/internal/output"
)

// addEnvvarFormatFlag registers the shared --format flag for the listing envvar
// leaves (table/csv/json/ids), defaulting to table like Node.
func addEnvvarFormatFlag(c *cobra.Command, format *string) {
	c.Flags().StringVarP(format, "format", "f", "table", "Render output in a particular format: table, csv, json, or ids.")
}

func newDevEnvEnvvarCmd() *cobra.Command {
	ev := &cobra.Command{Use: "envvar", Short: "Manage environment variables for a local environment"}
	ev.AddCommand(
		envvarGetCmd(), envvarGetAllCmd(), envvarListCmd(), envvarSetCmd(), envvarDeleteCmd(),
	)
	return ev
}

func envvarGetCmd() *cobra.Command {
	c := &cobra.Command{Use: "get <name>", Short: "Get a variable", Args: cobra.ExactArgs(1), SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			// Node trims but does NOT validate here (vip-dev-env-envvar-get.js:33).
			name := strings.TrimSpace(args[0])
			v, ok, err := devenv.EnvVarGet(slug, name)
			if err != nil {
				return err
			}
			if !ok {
				return fmt.Errorf("variable %q is not set", name)
			}
			fmt.Fprintln(cmd.OutOrStdout(), v)
			return nil
		}}
	addSlugFlag(c)
	return c
}

func envvarGetAllCmd() *cobra.Command {
	var format string
	c := &cobra.Command{Use: "get-all", Short: "Get all variables", SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			all, err := devenv.EnvVarGetAll(slug)
			if err != nil {
				return err
			}
			names, _ := devenv.EnvVarList(slug)
			rows := make(output.OrderedRows, 0, len(names))
			for _, k := range names {
				rows = append(rows, output.OrderedRow{{Key: "name", Value: k}, {Key: "value", Value: all[k]}})
			}
			return output.Render(cmd.OutOrStdout(), output.Format(format), rows)
		}}
	addSlugFlag(c)
	addEnvvarFormatFlag(c, &format)
	return c
}

func envvarListCmd() *cobra.Command {
	var format string
	c := &cobra.Command{Use: "list", Short: "List variable names", SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			names, err := devenv.EnvVarList(slug)
			if err != nil {
				return err
			}
			rows := make(output.OrderedRows, 0, len(names))
			for _, k := range names {
				rows = append(rows, output.OrderedRow{{Key: "name", Value: k}})
			}
			return output.Render(cmd.OutOrStdout(), output.Format(format), rows)
		}}
	addSlugFlag(c)
	addEnvvarFormatFlag(c, &format)
	return c
}

func envvarSetCmd() *cobra.Command {
	var fromFile string
	c := &cobra.Command{Use: "set <name> [value]", Short: "Set a variable", Args: cobra.RangeArgs(1, 2), SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			// Node trims the name and then runs validateNameWithMessage,
			// exiting 1 on failure (vip-dev-env-envvar-set.js:46,52). Without
			// it a lowercase or hyphenated name lands in .env, where it is not
			// a valid shell identifier and the container silently ignores it.
			name := strings.TrimSpace(args[0])
			if name == "" {
				return errors.New("variable name is required")
			}
			if err := envvar.ValidateName(name); err != nil {
				return err
			}
			var value string
			switch {
			case len(args) == 2:
				value = args[1]
			case fromFile != "":
				b, err := os.ReadFile(fromFile)
				if err != nil {
					return fmt.Errorf("reading --from-file %q: %w", fromFile, err)
				}
				// Node's readFromFile TRIMS (src/lib/read-file.ts:8). Skipping
				// the trim makes a trailing newline part of the value, so an
				// API token read from a file is silently wrong.
				value = strings.TrimSpace(string(b))
			default:
				value, err = appctx.Input(cmd, fmt.Sprintf("Value for %s", name), "")
				if err != nil {
					return err
				}
			}
			if err := devenv.EnvVarSet(slug, name, value); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "Set %q. Restart the environment for the change to take effect.\n", name)
			return nil
		}}
	addSlugFlag(c)
	c.Flags().StringVarP(&fromFile, "from-file", "f", "", "Read the variable value from a UTF-8 text file (useful for multiline values).")
	return c
}

func envvarDeleteCmd() *cobra.Command {
	c := &cobra.Command{Use: "delete <name>", Short: "Delete a variable", Args: cobra.ExactArgs(1), SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			// Node trims but does NOT validate here (vip-dev-env-envvar-delete.js:32).
			name := strings.TrimSpace(args[0])
			removed, err := devenv.EnvVarDelete(slug, name)
			if err != nil {
				return err
			}
			// Node exits 1 on a name that was not there
			// (vip-dev-env-envvar-delete.js:51-54). Reporting success for a
			// delete that removed nothing hides a typo'd name in a script.
			if !removed {
				return fmt.Errorf("The environment variable %q does not exist", name)
			}
			fmt.Fprintf(cmd.OutOrStdout(), "Deleted %q. Restart the environment for the change to take effect.\n", name)
			return nil
		}}
	addSlugFlag(c)
	return c
}

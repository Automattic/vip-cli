package commands

import (
	"errors"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/devenv"
)

// argsAfterDashes returns the args following the cobra `--` terminator. cobra
// stores them via ArgsLenAtDash; everything at/after that index is post-`--`.
func argsAfterDashes(cmd *cobra.Command, args []string) []string {
	n := cmd.ArgsLenAtDash()
	if n < 0 {
		return nil
	}
	return args[n:]
}

func newDevEnvExecCmd() *cobra.Command {
	c := &cobra.Command{
		Use:           "exec",
		Short:         "Run a WP-CLI command against a local environment",
		Long:          "Run a WP-CLI command. A double dash (\"--\") must separate vip args from the wp command:\n  vip dev-env exec --slug=example -- wp post list",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			wpArgs := argsAfterDashes(cmd, args)
			if len(wpArgs) == 0 {
				return errors.New(`a double dash ("--") must separate vip args from the wp command; run "vip dev-env exec --help"`)
			}
			return devenv.Exec(cmd.Context(), slug, wpArgs)
		},
	}
	addSlugFlag(c)
	// --force/--quiet are registered for Node flag-parity. The behaviors they
	// gate (the pre-exec running-env check that --force skips, and --quiet's
	// message suppression) are part of the devenv_e2e runtime path and are not
	// wired in the Docker-free cutover; they are accepted but currently no-ops.
	// TODO(devenv): honor --force/--quiet when the running-env check lands.
	c.Flags().BoolP("force", "f", false, "Skip the running-environment check.")
	c.Flags().BoolP("quiet", "q", false, "Suppress informational messages.")
	return c
}

func newDevEnvShellCmd() *cobra.Command {
	var root bool
	var service string
	c := &cobra.Command{
		Use:           "shell",
		Short:         "Open a shell in a local environment",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			svc := service
			if svc == "" {
				svc = "php"
			}
			return devenv.Shell(cmd.Context(), slug, svc, root, argsAfterDashes(cmd, args))
		},
	}
	addSlugFlag(c)
	c.Flags().BoolVarP(&root, "root", "r", false, "Open the shell with root privileges.")
	c.Flags().StringVar(&service, "service", "", "Restrict to a single service (default php).")
	return c
}

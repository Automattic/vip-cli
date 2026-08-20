package commands

import (
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/devenv"
)

func newDevEnvLogsCmd() *cobra.Command {
	var follow bool
	var service string
	c := &cobra.Command{
		Use:           "logs",
		Short:         "Show logs for a local environment",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			return devenv.Logs(cmd.Context(), slug, devenv.LogOptions{Follow: follow, Service: service})
		},
	}
	addSlugFlag(c)
	c.Flags().BoolVarP(&follow, "follow", "f", false, "Continually output logs as they are generated.")
	c.Flags().StringVar(&service, "service", "", "Restrict to a single service.")
	return c
}

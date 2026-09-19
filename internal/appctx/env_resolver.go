package appctx

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

// WithEnvContext expects WithAppContext to have run earlier in the chain.
// It picks the target Env from AppEnv.AvailableEnvs() using --env, or auto-
// selects when the app has exactly one env, or prompts (interactive),
// or errors (non-interactive with multiple envs).
func WithEnvContext() Middleware {
	return func(next RunFunc) RunFunc {
		return func(cmd *cobra.Command, args []string) error {
			ae := FromContext(cmd.Context())
			if ae == nil {
				return fmt.Errorf("WithEnvContext requires WithAppContext earlier in the chain")
			}
			envs := ae.AvailableEnvs()

			envFlag := ""
			if f := cmd.Flag("env"); f != nil {
				envFlag = f.Value.String()
			}

			if envFlag == "" {
				switch len(envs) {
				case 0:
					return fmt.Errorf("app %q has no environments", ae.App.Name)
				case 1:
					ae.Env = envs[0]
					cmd.SetContext(WithAppEnv(cmd.Context(), ae))
					return next(cmd, args)
				default:
					ids := envIdentifiers(envs)
					if !IsInteractive(cmd) {
						return fmt.Errorf("--env is required (one of %s)", strings.Join(ids, ", "))
					}
					picked, err := Select(cmd,
						fmt.Sprintf("Choose an environment for %s:", ae.App.Name), ids)
					if err != nil {
						return fmt.Errorf("--env is required (one of %s): %w",
							strings.Join(ids, ", "), err)
					}
					envFlag = picked
				}
			}

			needle := strings.ToLower(envFlag)
			for _, e := range envs {
				if strings.ToLower(getEnvIdentifier(e)) == needle {
					ae.Env = e
					cmd.SetContext(WithAppEnv(cmd.Context(), ae))
					return next(cmd, args)
				}
			}
			return fmt.Errorf("environment %q not found on app %q; available: %s",
				envFlag, ae.App.Name, strings.Join(envIdentifiers(envs), ", "))
		}
	}
}

// WithChildEnvContext is WithEnvContext + rejection of production envs.
// Mirrors Node's _opts.childEnvContext; used by destructive commands that
// must never run on production.
func WithChildEnvContext() Middleware {
	inner := WithEnvContext()
	return func(next RunFunc) RunFunc {
		return inner(func(cmd *cobra.Command, args []string) error {
			ae := FromContext(cmd.Context())
			if ae != nil && ae.Env.Type == "production" {
				return fmt.Errorf("this command cannot run on production environments")
			}
			return next(cmd, args)
		})
	}
}

func envNames(envs []Env) []string {
	out := make([]string, 0, len(envs))
	for _, e := range envs {
		out = append(out, e.Name)
	}
	return out
}

// getEnvIdentifier ports Node's src/lib/cli/command.js helper of the same
// name. For the canonical "main" env on an app (where env.appId == env.id)
// it returns env.type ("production", "develop", ...). For sibling envs of
// the same type (the disambiguating case) it returns "type.name".
//
// This is what users type as the env half of @app.env aliases — matching
// must be case-insensitive against this identifier, NOT env.name alone.
func getEnvIdentifier(e Env) string {
	identifier := e.Type
	if e.Name != "" && e.Name != e.Type && e.AppId != e.ID {
		identifier = e.Type + "." + e.Name
	}
	return identifier
}

func envIdentifiers(envs []Env) []string {
	out := make([]string, 0, len(envs))
	for _, e := range envs {
		out = append(out, getEnvIdentifier(e))
	}
	return out
}

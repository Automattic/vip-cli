package commands

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/Khan/genqlient/graphql"
	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/gql"
)

// createDefaults are the wizard pre-selected values derived from an app/env when
// `@app.env dev-env create` is used. Mirrors Node's getOptionsFromAppInfo
// (dev-environment-cli.ts:257) — the subset that seeds the create wizard.
type createDefaults struct {
	Title               string
	Multisite           bool
	PHP                 string
	WordPress           string
	MediaRedirectDomain string
}

// buildCreateDefaults maps resolved app/env fields to wizard defaults. Title
// falls back env name → app name (Node: env.name || app.name || ”).
func buildCreateDefaults(appName, envName string, isMultisite bool, primaryDomain, php, wordpress string) createDefaults {
	title := envName
	if title == "" {
		title = appName
	}
	return createDefaults{
		Title:               title,
		Multisite:           isMultisite,
		PHP:                 php,
		WordPress:           wordpress,
		MediaRedirectDomain: primaryDomain,
	}
}

// fetchAppCreateDefaults best-effort resolves the @app.env alias (propagated
// into --app/--env by the root) and fetches the app info that pre-populates the
// create wizard. Returns nil when no app was given or anything fails — matching
// Node, which wraps getApplicationInformation in try/catch and continues with
// generic defaults after a warning (vip-dev-env-create.js).
func fetchAppCreateDefaults(cmd *cobra.Command) *createDefaults {
	appKey := strings.TrimSpace(lookupRootFlag(cmd, "app"))
	if appKey == "" {
		return nil // local create; no app context
	}
	cfg := GetConfig()
	if cfg.GQLClient == nil {
		return nil // auth-bypassed without a client; nothing to fetch
	}
	envKey := strings.TrimSpace(lookupRootFlag(cmd, "env"))

	warn := func(err error) *createDefaults {
		fmt.Fprintln(cmd.ErrOrStderr(),
			color.YellowString("Warning:"),
			fmt.Sprintf("failed to fetch application %q information: %v", appKey, err))
		return nil
	}

	appID, err := resolveAppIDForCreate(cmd.Context(), cfg.GQLClient, appKey)
	if err != nil {
		return warn(err)
	}
	resp, err := gql.DevEnvAppInfo(cmd.Context(), cfg.GQLClient, appID)
	if err != nil {
		return warn(err)
	}
	if resp == nil || resp.App == nil {
		return warn(fmt.Errorf("no app matching %q found", appKey))
	}
	env := pickCreateEnv(resp.App.Environments, envKey)
	if env == nil {
		return warn(fmt.Errorf("no matching environment for %q", appKey))
	}

	d := buildCreateDefaults(
		strVal(resp.App.Name), strVal(env.Name), boolVal(env.IsMultisite),
		primaryDomainName(env), softwareVersion(env, "php"), softwareVersion(env, "wordpress"),
	)
	return &d
}

// resolveAppIDForCreate turns the --app key into a numeric app ID: a numeric key
// is used directly; a name is resolved via ResolveAppByName (first match).
func resolveAppIDForCreate(ctx context.Context, client graphql.Client, appKey string) (int64, error) {
	if id, err := strconv.ParseInt(appKey, 10, 64); err == nil {
		return id, nil
	}
	resp, err := gql.ResolveAppByName(ctx, client, appKey)
	if err != nil {
		return 0, err
	}
	if resp == nil || resp.Apps == nil || len(resp.Apps.Edges) == 0 || resp.Apps.Edges[0] == nil || resp.Apps.Edges[0].Id == nil {
		return 0, fmt.Errorf("no app matching name %q found", appKey)
	}
	return *resp.Apps.Edges[0].Id, nil
}

// pickCreateEnv selects the env matching envType; if envType is empty and there
// is exactly one env, that one is used (Node's single-env shortcut). Returns nil
// when no unambiguous match exists.
func pickCreateEnv(envs []*gql.DevEnvAppInfoAppEnvironmentsAppEnvironment, envType string) *gql.DevEnvAppInfoAppEnvironmentsAppEnvironment {
	if envType != "" {
		for _, e := range envs {
			if e != nil && strVal(e.Type) == envType {
				return e
			}
		}
		return nil
	}
	if len(envs) == 1 {
		return envs[0]
	}
	return nil
}

func primaryDomainName(env *gql.DevEnvAppInfoAppEnvironmentsAppEnvironment) string {
	if env.PrimaryDomain == nil {
		return ""
	}
	return env.PrimaryDomain.Name
}

// softwareVersion returns the env's current php or wordpress version, or "".
func softwareVersion(env *gql.DevEnvAppInfoAppEnvironmentsAppEnvironment, component string) string {
	ss := env.SoftwareSettings
	if ss == nil {
		return ""
	}
	switch component {
	case "php":
		if ss.Php != nil && ss.Php.Current != nil {
			return ss.Php.Current.Version
		}
	case "wordpress":
		if ss.Wordpress != nil && ss.Wordpress.Current != nil {
			return ss.Wordpress.Current.Version
		}
	}
	return ""
}

func strVal(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func boolVal(p *bool) bool {
	return p != nil && *p
}

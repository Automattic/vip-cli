package appctx

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/Khan/genqlient/graphql"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/gql"
)

// AppContextConfig wires the WithAppContext middleware to a GraphQL client.
type AppContextConfig struct {
	Client graphql.Client
}

// WithAppContext returns a middleware that resolves the --app flag (or the
// @app alias propagated into it by envalias.Rewrite) to an App and stashes
// it in cmd.Context() via WithAppEnv.
//
// Behavior:
//   - --app numeric        -> ResolveAppByID
//   - --app non-numeric    -> ResolveAppByName (first match)
//   - --app empty, NI      -> error
//   - --app empty, interactive -> prompt for name, then resolve
//   - no match             -> error mentioning the lookup key
//
// The full app.environments list is stashed via AppEnv.SetAvailableEnvs so
// WithEnvContext (Task 9) can narrow without another network roundtrip.
func WithAppContext(cfg AppContextConfig) Middleware {
	return func(next RunFunc) RunFunc {
		return func(cmd *cobra.Command, args []string) error {
			appFlag := lookupFlag(cmd, "app")
			if appFlag == "" {
				prompted, err := Input(cmd, "App name or ID:", "")
				if err != nil {
					return fmt.Errorf("--app is required: %w", err)
				}
				appFlag = strings.TrimSpace(prompted)
				if appFlag == "" {
					return fmt.Errorf("--app is required")
				}
			}

			envFlag := lookupFlag(cmd, "env")

			app, envs, err := resolveApp(cmd, cfg.Client, appFlag, envFlag)
			if err != nil {
				return err
			}

			ae := FromContext(cmd.Context())
			if ae == nil {
				ae = &AppEnv{}
			}
			ae.App = app
			ae.SetAvailableEnvs(envs)
			cmd.SetContext(WithAppEnv(cmd.Context(), ae))
			return next(cmd, args)
		}
	}
}

// envGetter unifies the differently-named env structs that ResolveAppByID
// and ResolveAppByName produce. genqlient emits a GetXxx() method per field
// on every node type, so both `*ResolveAppByIDAppEnvironmentsAppEnvironment`
// and `*ResolveAppByNameAppsAppListEdgesAppEnvironmentsAppEnvironment`
// satisfy this interface — no reflection needed.
type envGetter interface {
	GetId() *int64
	GetAppId() *int64
	GetName() *string
	GetType() *string
	GetUniqueLabel() *string
	GetDefaultDomain() *string
	GetIsMultisite() *bool
}

func resolveApp(cmd *cobra.Command, client graphql.Client, appKey, envKey string) (App, []Env, error) {
	if client == nil {
		return App{}, nil, fmt.Errorf("appctx: GraphQL client not configured")
	}
	// envKey is intentionally NOT passed to the GraphQL query: the
	// environments field has no useful filter (server-side filter would only
	// match env.name, but Node's getEnvIdentifier resolves on env.type for the
	// main env). Fetch all envs and filter client-side in WithEnvContext.
	_ = envKey
	ctx := cmd.Context()

	if id, err := strconv.ParseInt(appKey, 10, 64); err == nil {
		resp, qerr := gql.ResolveAppByID(ctx, client, id)
		if qerr != nil {
			return App{}, nil, fmt.Errorf("resolve app id=%d: %w", id, qerr)
		}
		if resp == nil || resp.App == nil || resp.App.Id == nil {
			return App{}, nil, fmt.Errorf("no app matching id=%d found", id)
		}
		envGetters := make([]envGetter, 0, len(resp.App.Environments))
		for _, e := range resp.App.Environments {
			if e != nil {
				envGetters = append(envGetters, e)
			}
		}
		return buildApp(resp.App.Id, resp.App.Name, resp.App.Type, resp.App.TypeId), envsFromGetters(envGetters), nil
	}

	resp, err := gql.ResolveAppByName(ctx, client, appKey)
	if err != nil {
		return App{}, nil, fmt.Errorf("resolve app name=%q: %w", appKey, err)
	}
	if resp == nil || resp.Apps == nil || len(resp.Apps.Edges) == 0 || resp.Apps.Edges[0] == nil {
		return App{}, nil, fmt.Errorf("no app matching name=%q found", appKey)
	}
	edge := resp.Apps.Edges[0]
	envGetters := make([]envGetter, 0, len(edge.Environments))
	for _, e := range edge.Environments {
		if e != nil {
			envGetters = append(envGetters, e)
		}
	}
	return buildApp(edge.Id, edge.Name, edge.Type, edge.TypeId), envsFromGetters(envGetters), nil
}

func buildApp(id *int64, name *string, appType *string, typeId *int64) App {
	var a App
	if id != nil {
		a.ID = *id
	}
	if name != nil {
		a.Name = *name
	}
	if appType != nil {
		a.Type = *appType
	}
	if typeId != nil {
		a.TypeId = *typeId
	}
	return a
}

func envsFromGetters(getters []envGetter) []Env {
	if len(getters) == 0 {
		return nil
	}
	out := make([]Env, 0, len(getters))
	for _, g := range getters {
		e := Env{}
		if id := g.GetId(); id != nil {
			e.ID = *id
		}
		if appID := g.GetAppId(); appID != nil {
			e.AppId = *appID
		}
		if name := g.GetName(); name != nil {
			e.Name = *name
		}
		if typ := g.GetType(); typ != nil {
			e.Type = *typ
		}
		if ul := g.GetUniqueLabel(); ul != nil {
			e.UniqueLabel = *ul
		}
		if d := g.GetDefaultDomain(); d != nil {
			e.DefaultDomain = *d
		}
		if multisite := g.GetIsMultisite(); multisite != nil {
			e.IsMultisite = *multisite
		}
		if e.ID == 0 && e.Name == "" && e.Type == "" {
			continue
		}
		out = append(out, e)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func ptrIfNonEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// lookupFlag returns the string value of the named flag, walking both local
// and persistent flag tables on cmd (and any ancestor that propagated a
// persistent flag through pflag's lookup chain). Returns "" if the flag is
// not defined. Mirrors how interactive.go reads --non-interactive: directly
// off the *pflag.Flag so we don't depend on Cobra's lazy merge having run.
func lookupFlag(cmd *cobra.Command, name string) string {
	if cmd == nil {
		return ""
	}
	if f := cmd.Flag(name); f != nil {
		return f.Value.String()
	}
	return ""
}

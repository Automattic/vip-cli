//go:build parity

package parity

import (
	"bytes"
	"cmp"
	"context"
	jsontext "encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/envalias"
)

type parkerHTTPDoer interface {
	Do(*http.Request) (*http.Response, error)
}

const (
	parkerContextPageSize    = 100
	parkerDiscoveryBodyLimit = 2 << 20
)

const parkerContextsQuery = `query LocalParkerParityContexts($first: Int!) {
  apps(first: $first) {
    total
    edges {
      id
      name
      typeId
      environments { id appId name type }
    }
  }
}`

const parkerCandidateQuery = `query LocalParkerParityCandidate($appId: Int!, $envId: Int!) {
  app(id: $appId) {
    environments(id: $envId) {
      id
      softwareSettings {
        wordpress { current { version } }
        php { current { version } }
        muplugins { current { version } }
        nodejs { current { version } }
      }
    }
  }
}`

type parkerGraphQLError struct {
	Message string `json:"message"`
	Path    []any  `json:"path"`
	// Parker (Apollo) usually leaves the top-level `path` empty and reports the
	// resolver path under extensions.exception instead — a live GOOP outage
	// arrives as {"message":"… (VIP: fetch failed)","extensions":{"exception":
	// {"path":["apps"]}}}. Read both so the resolver name survives either shape.
	Extensions *struct {
		Exception *struct {
			Path []any `json:"path"`
		} `json:"exception"`
	} `json:"extensions"`
}

// resolverPath returns whichever path shape the server used, top-level first.
func (e parkerGraphQLError) resolverPath() []any {
	if len(e.Path) > 0 {
		return e.Path
	}
	if e.Extensions != nil && e.Extensions.Exception != nil {
		return e.Extensions.Exception.Path
	}
	return nil
}

// formatParkerGraphQLErrors renders a GraphQL errors[] payload into something
// diagnosable. Parker answers HTTP 200 with errors[] when a backing service is
// unreachable — GOOP not listening on :2999 surfaces as
// "(VIP: fetch failed)" on path ["apps"] — so this text is the only thing that
// distinguishes "the parity gate is broken" from "a backing service is down".
// Without it the caller reports a bare contexts_graphql_error and the reader
// has to go spelunking in container logs to learn anything at all.
//
// Redacted through RedactSecrets because Parker echoes request context into
// some error payloads and this string ends up in CI logs.
func formatParkerGraphQLErrors(errs []parkerGraphQLError, token string) string {
	parts := make([]string, 0, len(errs))
	for _, e := range errs {
		msg := RedactSecrets(e.Message, token)
		if path := e.resolverPath(); len(path) > 0 {
			segs := make([]string, 0, len(path))
			for _, p := range path {
				segs = append(segs, fmt.Sprint(p))
			}
			msg = fmt.Sprintf("%s (path: %s)", msg, strings.Join(segs, "."))
		}
		parts = append(parts, msg)
	}
	return strings.Join(parts, "; ")
}

type parkerCandidate struct {
	AppID    int64
	AppName  string
	TypeID   int64
	EnvID    int64
	EnvAppID int64
	EnvName  string
	EnvType  string
}

type parkerContextPage struct {
	Apps *struct {
		Total int64 `json:"total"`
		Edges []*struct {
			ID           int64  `json:"id"`
			Name         string `json:"name"`
			TypeID       int64  `json:"typeId"`
			Environments []*struct {
				ID    int64  `json:"id"`
				AppID int64  `json:"appId"`
				Name  string `json:"name"`
				Type  string `json:"type"`
			} `json:"environments"`
		} `json:"edges"`
	} `json:"apps"`
}

type parkerSoftwareVersion struct {
	Current *struct {
		Version string `json:"version"`
	} `json:"current"`
}

type parkerCandidateData struct {
	App *struct {
		Environments []*struct {
			ID               int64 `json:"id"`
			SoftwareSettings *struct {
				Wordpress *parkerSoftwareVersion `json:"wordpress"`
				PHP       *parkerSoftwareVersion `json:"php"`
				Muplugins *parkerSoftwareVersion `json:"muplugins"`
				NodeJS    *parkerSoftwareVersion `json:"nodejs"`
			} `json:"softwareSettings"`
		} `json:"environments"`
	} `json:"app"`
}

func postParkerQuery(
	ctx context.Context,
	doer parkerHTTPDoer,
	endpoint, token, operation, query string,
	variables map[string]any,
	dst any,
) ([]parkerGraphQLError, error) {
	body, err := json.Marshal(map[string]any{
		"operationName": operation,
		"query":         query,
		"variables":     variables,
	})
	if err != nil {
		return nil, errors.New("local Parker discovery request encoding failed")
	}
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(endpoint, "/")+"/graphql",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, errors.New("local Parker discovery request construction failed")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := doer.Do(req)
	if err != nil {
		return nil, errors.New("local Parker discovery transport failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("local Parker discovery HTTP status %d", resp.StatusCode)
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, parkerDiscoveryBodyLimit+1))
	if err != nil || len(raw) > parkerDiscoveryBodyLimit {
		return nil, errors.New("local Parker discovery response could not be read safely")
	}
	var envelope struct {
		Data   jsontext.Value       `json:"data"`
		Errors []parkerGraphQLError `json:"errors"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, errors.New("local Parker discovery response was malformed")
	}
	if len(envelope.Data) == 0 || string(envelope.Data) == "null" {
		if len(envelope.Errors) > 0 {
			return envelope.Errors, nil
		}
		return nil, errors.New("local Parker discovery response was missing data")
	}
	if err := json.Unmarshal(envelope.Data, dst); err != nil {
		return nil, errors.New("local Parker discovery data was malformed")
	}
	return envelope.Errors, nil
}

func discoverLocalParkerContext(ctx context.Context, token string) (ParkerContext, error) {
	client := &http.Client{
		Transport: &http.Transport{Proxy: nil},
		Timeout:   10 * time.Second,
	}
	return discoverParkerContext(ctx, client, ParkerAPIHost, token)
}

func discoverParkerContext(
	ctx context.Context,
	doer parkerHTTPDoer,
	endpoint, token string,
) (ParkerContext, error) {
	candidates, err := listParkerCandidates(ctx, doer, endpoint, token)
	if err != nil {
		return ParkerContext{}, err
	}
	slices.SortFunc(candidates, func(a, b parkerCandidate) int {
		if n := cmp.Compare(a.AppID, b.AppID); n != 0 {
			return n
		}
		return cmp.Compare(a.EnvID, b.EnvID)
	})

	for _, candidate := range candidates {
		candidateCtx, ok := candidateContext(candidate)
		if !ok {
			continue
		}
		eligible, err := probeParkerCandidate(ctx, doer, endpoint, token, candidate)
		if err != nil {
			return ParkerContext{}, err
		}
		if eligible {
			return candidateCtx, nil
		}
	}
	return ParkerContext{}, errors.New("no_suitable_context")
}

func listParkerCandidates(
	ctx context.Context,
	doer parkerHTTPDoer,
	endpoint, token string,
) ([]parkerCandidate, error) {
	var page parkerContextPage
	errs, err := postParkerQuery(ctx, doer, endpoint, token, "LocalParkerParityContexts", parkerContextsQuery, map[string]any{
		"first": parkerContextPageSize,
	}, &page)
	if err != nil {
		return nil, err
	}
	if len(errs) > 0 {
		return nil, fmt.Errorf("contexts_graphql_error: %s",
			formatParkerGraphQLErrors(errs, token))
	}
	if page.Apps == nil || page.Apps.Total < 0 {
		return nil, errors.New("malformed_context_page")
	}
	// Parker's App.query reports the global GOOP total before per-user access
	// filtering, so accessible edge count may legitimately be smaller.
	if int64(len(page.Apps.Edges)) > page.Apps.Total {
		return nil, errors.New("edge_total_mismatch")
	}

	candidates := []parkerCandidate{}
	for _, app := range page.Apps.Edges {
		if app == nil {
			continue
		}
		for _, env := range app.Environments {
			if env == nil {
				continue
			}
			candidates = append(candidates, parkerCandidate{
				AppID: app.ID, AppName: app.Name, TypeID: app.TypeID,
				EnvID: env.ID, EnvAppID: env.AppID, EnvName: env.Name, EnvType: env.Type,
			})
		}
	}
	return candidates, nil
}

func probeParkerCandidate(
	ctx context.Context,
	doer parkerHTTPDoer,
	endpoint, token string,
	candidate parkerCandidate,
) (bool, error) {
	var data parkerCandidateData
	errs, err := postParkerQuery(ctx, doer, endpoint, token, "LocalParkerParityCandidate", parkerCandidateQuery, map[string]any{
		"appId": candidate.AppID,
		"envId": candidate.EnvID,
	}, &data)
	if err != nil {
		return false, err
	}
	if len(errs) > 0 {
		return false, nil
	}
	if data.App == nil {
		return false, errors.New("malformed_candidate_response")
	}
	if len(data.App.Environments) != 1 || data.App.Environments[0] == nil {
		return false, nil
	}
	env := data.App.Environments[0]
	if env.ID != candidate.EnvID {
		return false, errors.New("candidate_id_mismatch")
	}
	if !parkerSoftwareEligible(env.SoftwareSettings) {
		return false, nil
	}
	return true, nil
}

func parkerSoftwareEligible(settings *struct {
	Wordpress *parkerSoftwareVersion `json:"wordpress"`
	PHP       *parkerSoftwareVersion `json:"php"`
	Muplugins *parkerSoftwareVersion `json:"muplugins"`
	NodeJS    *parkerSoftwareVersion `json:"nodejs"`
}) bool {
	if settings == nil {
		return false
	}
	for _, software := range []*parkerSoftwareVersion{
		settings.Wordpress, settings.PHP, settings.Muplugins, settings.NodeJS,
	} {
		if software != nil && software.Current != nil && strings.TrimSpace(software.Current.Version) != "" {
			return true
		}
	}
	return false
}

func parkerEnvironmentIdentifier(c parkerCandidate) string {
	if c.EnvType == "" {
		return ""
	}
	if c.EnvID == c.EnvAppID || c.EnvName == "" || c.EnvName == c.EnvType {
		return c.EnvType
	}
	return c.EnvType + "." + c.EnvName
}

func candidateContext(c parkerCandidate) (ParkerContext, bool) {
	identifier := parkerEnvironmentIdentifier(c)
	ctx := ParkerContext{
		AppID: c.AppID, AppName: c.AppName,
		EnvID: c.EnvID, EnvIdentifier: identifier,
	}
	if ctx.AppID <= 0 || ctx.EnvID <= 0 || strings.TrimSpace(ctx.AppName) == "" || identifier == "" {
		return ParkerContext{}, false
	}
	rewritten, app, env, err := envalias.Rewrite([]string{ctx.Alias()})
	if err != nil || len(rewritten) != 0 || app != strings.ToLower(ctx.AppName) || env != strings.ToLower(identifier) {
		return ParkerContext{}, false
	}
	return ctx, true
}

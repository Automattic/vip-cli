package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/gql"
)

const devEnvSyncSitesPageSize int64 = 100

// fetchDevEnvSyncSites reads the complete SDS catalog. The returned issue is a
// stable, sanitized category: callers may offer explicit recovery mappings,
// while telemetry can classify failures without recording URLs or raw server
// errors. A non-empty issue always returns an empty site slice so a partial or
// malformed catalog can never drive automatic rewrites.
func fetchDevEnvSyncSites(
	ctx context.Context,
	client graphql.Client,
	appID, envID int64,
	log func(string),
) ([]devenv.SyncSite, string) {
	if client == nil {
		return nil, "transport"
	}

	var after *string
	seenCursors := map[string]bool{}
	byBlogID := map[int64]devenv.SyncSite{}
	var sites []devenv.SyncSite
	var expectedTotal int64 = -1
	var rawCount int64

	for {
		resp, err := gql.DevEnvSyncSites(
			gql.WithAllowGQLErrors(ctx),
			client,
			appID,
			envID,
			after,
			devEnvSyncSitesPageSize,
		)
		if err != nil {
			return nil, "transport"
		}
		if resp == nil || resp.App == nil || len(resp.App.Environments) == 0 ||
			resp.App.Environments[0] == nil || resp.App.Environments[0].WpSitesSDS == nil {
			return nil, "missing_payload"
		}

		page := resp.App.Environments[0].WpSitesSDS
		if page.Total == nil || *page.Total < 0 {
			return nil, "missing_payload"
		}
		if expectedTotal < 0 {
			expectedTotal = *page.Total
		} else if expectedTotal != *page.Total {
			return nil, "total_mismatch"
		}

		for _, node := range page.Nodes {
			rawCount++
			if node == nil || node.BlogId == nil || *node.BlogId <= 0 {
				return nil, "invalid_nodes"
			}
			homeURL := ""
			if node.HomeUrl != nil {
				homeURL = strings.TrimSpace(*node.HomeUrl)
			}
			siteURL := ""
			if node.SiteUrl != nil {
				siteURL = strings.TrimSpace(*node.SiteUrl)
			}
			if homeURL == "" && siteURL == "" {
				return nil, "invalid_nodes"
			}
			site := devenv.SyncSite{BlogID: *node.BlogId, HomeURL: homeURL, SiteURL: siteURL}
			if previous, exists := byBlogID[site.BlogID]; exists {
				if previous != site {
					return nil, "invalid_nodes"
				}
				continue
			}
			byBlogID[site.BlogID] = site
			sites = append(sites, site)
		}

		if log != nil {
			log(fmt.Sprintf("Fetched %d of %d sites...", rawCount, expectedTotal))
		}
		next := ""
		if page.NextCursor != nil {
			next = strings.TrimSpace(*page.NextCursor)
		}
		if next == "" {
			break
		}
		if seenCursors[next] {
			return nil, "cursor_loop"
		}
		seenCursors[next] = true
		after = &next
	}

	if rawCount != expectedTotal {
		return nil, "total_mismatch"
	}
	if rawCount == 0 || len(sites) == 0 {
		return nil, "empty_catalog"
	}
	return sites, ""
}

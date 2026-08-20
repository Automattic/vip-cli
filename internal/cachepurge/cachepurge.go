// Package cachepurge wraps the PurgePageCache mutation.
//
// Node parity: src/lib/api/cache-purge.ts. The server canonicalizes the
// supplied URLs (e.g. host-normalization) and returns the canonical list on
// the response payload, so callers should use the returned slice for any
// downstream "Purged URL: ..." output rather than echoing the input.
package cachepurge

import (
	"context"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/gql"
)

// Purge invokes the purgePageCache mutation against the given environment
// and returns the server-canonicalized URL list. The returned slice MAY
// differ from urls (server normalizes hosts/casing); callers should rely
// on it when echoing results to the user.
func Purge(ctx context.Context, c graphql.Client, appID, envID int64, urls []string) ([]string, error) {
	input := &gql.PurgePageCacheInput{
		AppId:         appID,
		EnvironmentId: envID,
		Urls:          urls,
	}
	resp, err := gql.PurgePageCache(ctx, c, input)
	if err != nil {
		return nil, err
	}
	if resp == nil || resp.PurgePageCache == nil {
		// Defensive: schema marks PurgePageCachePayload non-null, but a
		// pathological server response could omit it. Return empty so the
		// caller prints nothing rather than panicking.
		return nil, nil
	}
	return resp.PurgePageCache.Urls, nil
}

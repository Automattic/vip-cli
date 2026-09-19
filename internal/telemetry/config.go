package telemetry

import "strings"

// Mirrors config/config.publish.json.
const (
	TracksEndpoint     = "https://public-api.wordpress.com/rest/v1.1/tracks/record"
	TracksUserType     = "vip:user_id"
	TracksAnonUserType = "anon"
	TracksEventPrefix  = "vip_cli_"

	// PendoEndpoint is the production Pendo endpoint — API_HOST's default
	// (src/lib/api.ts:21, PRODUCTION_API_HOST) plus Pendo.ENDPOINT ("/pendo").
	// Use PendoEndpointFor to honour an overridden API_HOST.
	PendoEndpoint    = defaultAPIHost + pendoPath
	PendoEventPrefix = TracksEventPrefix // same prefix as Tracks per tracker.ts

	defaultAPIHost = "https://api.wpvip.com"
	pendoPath      = "/pendo"
)

// PendoEndpointFor builds the Pendo URL for an API host.
//
// Node sends Pendo events through src/lib/api/http.ts, which prefixes API_HOST
// (`process.env.API_HOST || PRODUCTION_API_HOST`), so pointing Node at staging
// points its analytics at staging. Go hardcoded the production URL, which meant
// a developer or CI job running against a local or staging API still emitted
// every event into the production analytics pipeline.
func PendoEndpointFor(apiHost string) string {
	if apiHost == "" {
		return PendoEndpoint
	}
	return strings.TrimSuffix(apiHost, "/") + pendoPath
}

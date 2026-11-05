package telemetry

// Mirrors config/config.publish.json.
const (
	TracksEndpoint     = "https://public-api.wordpress.com/rest/v1.1/tracks/record"
	TracksUserType     = "vip:user_id"
	TracksAnonUserType = "anon"
	TracksEventPrefix  = "vip_cli_"
)

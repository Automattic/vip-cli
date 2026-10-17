package telemetry

import (
	"os"
	"sync"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/version"
)

// NewDefault constructs a Tracker wired with Tracks + Pendo clients and the
// keychain-backed UUID store. Returns nil if construction fails — callers
// should check.
//
// When DO_NOT_TRACK / GO_ENV=test / NODE_ENV=test is set the tracker is
// returned in a pre-disabled state without touching the OS keychain, so
// test binaries never block on a Keychain Access prompt.
//
// The UUID lookup is deferred to first event emission via GetUserID so that
// construction never touches the OS keychain. This prevents Keychain Access
// prompts on every invocation (e.g. --version, --help).
func NewDefault() *Tracker {
	if isDoNotTrack() {
		return &Tracker{Disabled: true}
	}
	host := os.Getenv("API_HOST")
	if host == "" {
		host = "https://api.wpvip.com"
	}
	var uuidStore *UUIDStore
	if !auth.EnvironmentTokenConfigured() {
		uuidStore = &UUIDStore{Keychain: keychain.New(host)}
	}

	// Environment sessions have no persistent credential or analytics identity.
	// Give each process a stable UUID without consulting the keychain.
	var once sync.Once
	var cachedUUID string
	getUUID := func() string {
		once.Do(func() {
			if uuidStore == nil {
				cachedUUID, _ = newRandomUUID()
			} else {
				cachedUUID, _ = uuidStore.Get()
			}
		})
		return cachedUUID
	}

	// Follow the ldflags-injected build version (Makefile -X
	// …/internal/version.Version). This was hardcoded to the literal
	// "vip-next/dev", so every released build reported itself to Tracks and
	// Pendo as a dev build and tagging a release silently changed nothing.
	userAgent := "vip-next/" + version.Version
	return &Tracker{
		Clients: []Client{
			&TracksClient{
				Endpoint:  TracksEndpoint,
				GetUserID: getUUID,
				UserType:  TracksAnonUserType,
				UserAgent: userAgent,
			},
			&PendoClient{
				// Node prefixes API_HOST (src/lib/api/http.ts); a staging or
				// local run must not post into production analytics.
				Endpoint:    PendoEndpointFor(host),
				GetUserID:   getUUID,
				UserAgent:   userAgent,
				EventPrefix: TracksEventPrefix,
			},
		},
		UUIDStore: uuidStore,
		Disabled:  false,
	}
}

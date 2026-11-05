package telemetry

import (
	"os"
	"sync"

	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/version"
)

// NewDefault constructs a Tracker wired with the Tracks client and the
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
	k := keychain.New(host)
	uuidStore := &UUIDStore{Keychain: k}

	// Lazy UUID resolution — do NOT touch keychain at construction.
	// First event emission will trigger the lookup (at most once).
	var once sync.Once
	var cachedUUID string
	getUUID := func() string {
		once.Do(func() { cachedUUID, _ = uuidStore.Get() })
		return cachedUUID
	}

	// Follow the ldflags-injected build version (Makefile -X
	// …/internal/version.Version). This was hardcoded to the literal
	// "vip-next/dev", so every released build reported itself to Tracks as a
	// dev build and tagging a release silently changed nothing.
	return &Tracker{
		Client: &TracksClient{
			Endpoint:  TracksEndpoint,
			GetUserID: getUUID,
			UserType:  TracksAnonUserType,
			UserAgent: "vip-next/" + version.Version,
		},
		UUIDStore: uuidStore,
		Disabled:  false,
	}
}

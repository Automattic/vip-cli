package telemetry

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/httpproxy"
)

// TracksClient posts analytics events to Automattic Tracks.
//
// Node parity: field names and prefix logic match src/lib/analytics/clients/tracks.ts.
//
// Known gap: Node's trackEvent sets `is_vip` on every event via checkIfUserIsVip(),
// which performs a per-event GraphQL call. That per-event network call is too expensive
// to replicate here; is_vip is intentionally omitted until a cached approach is designed.
//
// Addition vs Node: events[0][cli_binary_kind]=go-native is injected on every event
// per spec §9.3 for rollout adoption tracking.
type TracksClient struct {
	Endpoint  string
	UserID    string        // if non-empty, used as-is
	GetUserID func() string // called lazily on first TrackEvent when UserID is empty
	UserType  string
	UserAgent string
	HTTP      *http.Client
}

// resolveUserID returns UserID if set, otherwise calls GetUserID().
// Returns empty string when neither is configured.
func (c *TracksClient) resolveUserID() string {
	if c.UserID != "" {
		return c.UserID
	}
	if c.GetUserID != nil {
		return c.GetUserID()
	}
	return ""
}

// TrackEvent sends a single named event to Tracks.
// The event name is auto-prefixed with TracksEventPrefix ("vip_cli_") if not already present.
func (c *TracksClient) TrackEvent(name string, props map[string]any) error {
	if !strings.HasPrefix(name, TracksEventPrefix) {
		name = TracksEventPrefix + name
	}

	form := url.Values{}
	form.Set("commonProps[_ui]", c.resolveUserID())
	form.Set("commonProps[_ut]", c.UserType)
	form.Set("commonProps[_via_ua]", c.UserAgent)
	form.Set("events[0][_en]", name)
	// Spec §9.3: rollout adoption tracking — not present in Node binary.
	form.Set("events[0][cli_binary_kind]", "go-native")
	for k, v := range props {
		form.Set(fmt.Sprintf("events[0][%s]", k), fmt.Sprint(v))
	}

	req, err := http.NewRequest("POST", c.Endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", c.UserAgent)

	httpClient := c.HTTP
	if httpClient == nil {
		// A bare &http.Client{} inherits http.DefaultTransport's proxy policy,
		// which is the inverse of Node's. See internal/httpproxy.
		httpClient = httpproxy.ClientWithTimeout(5 * time.Second)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

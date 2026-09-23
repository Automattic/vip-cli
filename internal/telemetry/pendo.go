package telemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/debuglog"
	"github.com/Automattic/vip/internal/httpproxy"
)

// PendoClient posts analytics events to Pendo via the VIP API proxy.
//
// Node counterpart: src/lib/analytics/clients/pendo.ts.
//
// The Node client sends to Pendo.ENDPOINT = "/pendo" prefixed by API_HOST
// (https://api.wpvip.com), so the full URL is https://api.wpvip.com/pendo.
// Both runtimes authenticate through the current VIP session. Failures are
// diagnostic only: Tracker deliberately does not fail the user's command.
//
// Payload shape (mirrors Node's send() method):
//
//	{
//	  "context":    { ...env fields, org_id, org_slug, org_sfid, userAgent, userId },
//	  "event":      "<prefixed event name>",
//	  "properties": { ...eventProps },
//	  "timestamp":  <unix milliseconds>,
//	  "type":       "track",
//	  "visitorId":  "<userId>",
//	  "accountId":  "<org_sfid>",
//	}
type PendoClient struct {
	// Endpoint is the full URL, e.g. PendoEndpoint.
	Endpoint string
	// UserID is the anonymous UUID identifying this visitor.
	// If non-empty, used as-is. If empty and GetUserID is non-nil, GetUserID is called lazily.
	UserID string
	// GetUserID is called lazily on first TrackEvent when UserID is empty.
	GetUserID func() string
	// UserAgent is the CLI user-agent string.
	UserAgent string
	// EventPrefix is prepended to event names that don't already carry it.
	EventPrefix string
	// HTTP is the HTTP client; nil means a default 5-second-timeout client.
	HTTP *http.Client
	// GetToken reads the current session at send time, including login/logout
	// changes. Missing credentials skip Pendo without starting a login flow.
	GetToken func() (string, error)
	// Context carries this invocation's opt-in diagnostics.
	Context context.Context
}

// resolveUserID returns UserID if set, otherwise calls GetUserID().
// Returns empty string when neither is configured.
func (c *PendoClient) resolveUserID() string {
	if c.UserID != "" {
		return c.UserID
	}
	if c.GetUserID != nil {
		return c.GetUserID()
	}
	return ""
}

// pendoContext mirrors the Node context object merged in trackEvent().
// Fields use camelCase to match Node's JSON output exactly.
type pendoContext struct {
	// Env-derived fields.
	UserAgent string `json:"userAgent"`
	// Identity fields set per event.
	UserID  string `json:"userId"`
	OrgID   any    `json:"org_id"`
	OrgSlug any    `json:"org_slug"`
	OrgSfid any    `json:"org_sfid"`
}

// pendoPayload is the JSON body sent to the Pendo endpoint.
// Field names match Node's body construction in send() exactly.
type pendoPayload struct {
	Context    pendoContext   `json:"context"`
	Event      string         `json:"event"`
	Properties map[string]any `json:"properties"`
	Timestamp  int64          `json:"timestamp"`
	Type       string         `json:"type"`
	VisitorID  string         `json:"visitorId"`
	AccountID  string         `json:"accountId"`
}

// TrackEvent sends a single named event to Pendo.
// The event name is auto-prefixed with EventPrefix if not already present.
// Delivery errors contain only safe summaries; Tracker ignores them.
func (c *PendoClient) TrackEvent(name string, props map[string]any) error {
	requestContext := c.Context
	if requestContext == nil {
		requestContext = context.Background()
	}
	const namespace = "@automattic/vip:analytics:clients:pendo"
	fail := func(message string) error {
		debuglog.Printf(requestContext, namespace, "%s", message)
		return errors.New(message)
	}
	if c.GetToken == nil {
		debuglog.Printf(requestContext, namespace, "Skipping event: no authenticated session")
		return nil
	}
	token, err := c.GetToken()
	if err != nil || token == "" {
		debuglog.Printf(requestContext, namespace, "Skipping event: no authenticated session")
		return nil
	}
	if !strings.HasPrefix(name, c.EventPrefix) {
		name = c.EventPrefix + name
	}

	if props == nil {
		props = map[string]any{}
	}

	userID := c.resolveUserID()

	// Build context — mirrors Node's trackEvent() context merge.
	ctx := pendoContext{
		UserAgent: c.UserAgent,
		UserID:    userID,
		OrgID:     props["org_slug"], // Node sets org_id = eventProps.org_slug
		OrgSlug:   props["org_slug"],
		OrgSfid:   props["org_sfid"],
	}

	// accountId = context.org_sfid (Node: `${ this.context.org_sfid as string }`)
	accountID := ""
	if v, ok := props["org_sfid"]; ok && v != nil {
		if s, ok2 := v.(string); ok2 {
			accountID = s
		}
	}

	payload := pendoPayload{
		Context:    ctx,
		Event:      name,
		Properties: props,
		Timestamp:  time.Now().UnixMilli(),
		Type:       "track",
		VisitorID:  userID,
		AccountID:  accountID,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fail("Unable to encode event")
	}

	req, err := http.NewRequestWithContext(requestContext, "POST", c.Endpoint, bytes.NewReader(body))
	if err != nil {
		return fail("Unable to construct request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", c.UserAgent)
	req.Header.Set("Authorization", "Bearer "+token)

	httpClient := c.HTTP
	if httpClient == nil {
		// Node routes Pendo through api/http.ts (analytics/clients/pendo.ts:4),
		// so it is proxied by createProxyAgent's policy — not by
		// http.DefaultTransport's. See internal/httpproxy.
		httpClient = httpproxy.ClientWithTimeout(5 * time.Second)
	}

	debuglog.Printf(requestContext, namespace, "Sending event")
	resp, err := httpClient.Do(req)
	if err != nil {
		return fail("Request failed")
	}
	resp.Body.Close()
	debuglog.Printf(requestContext, namespace, "Response status=%d", resp.StatusCode)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fail(fmt.Sprintf("Request rejected: HTTP %d", resp.StatusCode))
	}
	return nil
}

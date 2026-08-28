package telemetry

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// captureRequest runs a PendoClient.TrackEvent call against a local httptest
// server and returns the decoded request payload plus the raw HTTP request.
func captureRequest(t *testing.T, c *PendoClient, name string, props map[string]any) (pendoPayload, *http.Request) {
	t.Helper()
	var captured pendoPayload
	var capturedReq *http.Request

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedReq = r
		b, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(b, &captured); err != nil {
			t.Fatalf("could not decode Pendo payload: %v\nbody: %s", err, b)
		}
		w.WriteHeader(200)
	}))
	t.Cleanup(srv.Close)

	c.Endpoint = srv.URL
	if err := c.TrackEvent(name, props); err != nil {
		t.Fatalf("TrackEvent returned unexpected error: %v", err)
	}
	if capturedReq == nil {
		t.Fatal("no request received by test server")
	}
	return captured, capturedReq
}

// TestPendoClientPostsExpectedPayload verifies that TrackEvent sends a POST
// with the correct JSON body matching Node's send() output: event name (prefixed),
// type "track", visitorId, accountId, context fields, and properties.
func TestPendoClientPostsExpectedPayload(t *testing.T) {
	c := &PendoClient{
		UserID:      "test-anon-uuid-1234",
		UserAgent:   "vip-cli/test-0.1",
		EventPrefix: TracksEventPrefix,
	}
	props := map[string]any{
		"command":  "vip whoami",
		"org_slug": "my-org",
		"org_sfid": "SF-999",
	}

	payload, req := captureRequest(t, c, "whoami_command_execute", props)

	// --- HTTP method and Content-Type ---
	if req.Method != "POST" {
		t.Errorf("HTTP method = %q, want POST", req.Method)
	}
	ct := req.Header.Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	if req.Header.Get("User-Agent") != "vip-cli/test-0.1" {
		t.Errorf("User-Agent = %q, want vip-cli/test-0.1", req.Header.Get("User-Agent"))
	}

	// --- type field ---
	if payload.Type != "track" {
		t.Errorf("type = %q, want track", payload.Type)
	}

	// --- event name: should be auto-prefixed ---
	wantEvent := "vip_cli_whoami_command_execute"
	if payload.Event != wantEvent {
		t.Errorf("event = %q, want %q", payload.Event, wantEvent)
	}

	// --- visitorId == userId ---
	if payload.VisitorID != "test-anon-uuid-1234" {
		t.Errorf("visitorId = %q, want test-anon-uuid-1234", payload.VisitorID)
	}

	// --- accountId == org_sfid ---
	if payload.AccountID != "SF-999" {
		t.Errorf("accountId = %q, want SF-999", payload.AccountID)
	}

	// --- context.userId == userId ---
	if payload.Context.UserID != "test-anon-uuid-1234" {
		t.Errorf("context.userId = %q, want test-anon-uuid-1234", payload.Context.UserID)
	}

	// --- context.userAgent ---
	if payload.Context.UserAgent != "vip-cli/test-0.1" {
		t.Errorf("context.userAgent = %q, want vip-cli/test-0.1", payload.Context.UserAgent)
	}

	// --- properties are passed through ---
	if v, ok := payload.Properties["command"]; !ok || v != "vip whoami" {
		t.Errorf("properties[command] = %v, want vip whoami", v)
	}

	// --- timestamp is non-zero ---
	if payload.Timestamp == 0 {
		t.Errorf("timestamp = 0, want non-zero Unix milliseconds")
	}
}

// TestPendoClientCarriesUserIdentity verifies that the anonymous UUID appears
// in both visitorId (top-level) and context.userId, matching Node's behavior
// where visitorId = `${ this.context.userId }` and context.userId = this.userId.
func TestPendoClientCarriesUserIdentity(t *testing.T) {
	const anonID = "deadbeef-cafe-babe-0000-111122223333"
	c := &PendoClient{
		UserID:      anonID,
		UserAgent:   "vip-cli/test-0.1",
		EventPrefix: TracksEventPrefix,
	}

	payload, _ := captureRequest(t, c, "some_event", nil)

	if payload.VisitorID != anonID {
		t.Errorf("visitorId = %q, want %q", payload.VisitorID, anonID)
	}
	if payload.Context.UserID != anonID {
		t.Errorf("context.userId = %q, want %q", payload.Context.UserID, anonID)
	}
}

// TestPendoClientHonorsExplicitPrefix verifies that a name already carrying
// the prefix is not double-prefixed (mirrors Node: if (!eventName.startsWith(this.eventPrefix))).
func TestPendoClientHonorsExplicitPrefix(t *testing.T) {
	c := &PendoClient{
		UserID:      "u",
		UserAgent:   "x",
		EventPrefix: TracksEventPrefix,
	}

	payload, _ := captureRequest(t, c, "vip_cli_already_prefixed", nil)

	if payload.Event != "vip_cli_already_prefixed" {
		t.Errorf("event = %q (must not double-prefix)", payload.Event)
	}
}

// TestPendoClientOrgContextFields verifies that org_id, org_slug, and org_sfid
// from eventProps are copied into the context (Node: this.context.org_id = eventProps.org_slug).
func TestPendoClientOrgContextFields(t *testing.T) {
	c := &PendoClient{
		UserID:      "u",
		UserAgent:   "x",
		EventPrefix: TracksEventPrefix,
	}
	props := map[string]any{
		"org_slug": "acme",
		"org_sfid": "SF-001",
	}

	payload, _ := captureRequest(t, c, "test_event", props)

	// org_id and org_slug should both equal eventProps.org_slug (Node behavior).
	if payload.Context.OrgID != "acme" {
		t.Errorf("context.org_id = %v, want acme", payload.Context.OrgID)
	}
	if payload.Context.OrgSlug != "acme" {
		t.Errorf("context.org_slug = %v, want acme", payload.Context.OrgSlug)
	}
	if payload.Context.OrgSfid != "SF-001" {
		t.Errorf("context.org_sfid = %v, want SF-001", payload.Context.OrgSfid)
	}
	if payload.AccountID != "SF-001" {
		t.Errorf("accountId = %q, want SF-001", payload.AccountID)
	}
}

// TestPendoClientSwallowsNetworkError verifies that a network failure returns
// nil (not an error), mirroring Node's catch block returning Promise.resolve(false).
func TestPendoClientSwallowsNetworkError(t *testing.T) {
	c := &PendoClient{
		Endpoint:    "http://127.0.0.1:1", // nothing listening
		UserID:      "u",
		UserAgent:   "x",
		EventPrefix: TracksEventPrefix,
	}
	if err := c.TrackEvent("test", nil); err != nil {
		t.Errorf("expected nil on network error (Node swallows errors), got %v", err)
	}
}

// TestPendoClientLazyUserIDResolved verifies that GetUserID is not called at
// construction time — only at TrackEvent call time.
func TestPendoClientLazyUserIDResolved(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	defer srv.Close()

	c := &PendoClient{
		Endpoint:    srv.URL,
		GetUserID:   func() string { calls++; return "lazy-uuid" },
		UserAgent:   "vip-next/test",
		EventPrefix: TracksEventPrefix,
	}
	// Before TrackEvent: GetUserID must not be called.
	if calls != 0 {
		t.Errorf("GetUserID called %d times before TrackEvent; want 0", calls)
	}
	if err := c.TrackEvent("test", nil); err != nil {
		t.Fatalf("TrackEvent: %v", err)
	}
	if calls != 1 {
		t.Errorf("GetUserID called %d times after TrackEvent; want 1", calls)
	}
}

// TestPendoClientPrefersExplicitUserID verifies that GetUserID is never called
// when UserID is already set explicitly.
func TestPendoClientPrefersExplicitUserID(t *testing.T) {
	c := &PendoClient{
		UserID:      "explicit",
		GetUserID:   func() string { t.Error("GetUserID must not be called when UserID is set"); return "" },
		UserAgent:   "x",
		EventPrefix: TracksEventPrefix,
	}
	payload, _ := captureRequest(t, c, "test_event", nil)
	if payload.VisitorID != "explicit" {
		t.Errorf("visitorId = %q, want explicit", payload.VisitorID)
	}
	if payload.Context.UserID != "explicit" {
		t.Errorf("context.userId = %q, want explicit", payload.Context.UserID)
	}
}

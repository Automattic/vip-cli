package rechallenge

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	json "encoding/json/v2"
)

func TestClientCreateSession(t *testing.T) {
	var gotMethod, gotPath, gotIdem, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotIdem = r.Header.Get("Idempotency-Key")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"challengeId":"abc","status":"pending","verificationUrl":"https://x/v/abc","pollIntervalSeconds":2,"expiresAt":"2026-06-05T12:00:00Z"}`))
	}))
	defer srv.Close()
	c := &Client{APIHost: srv.URL, HTTP: srv.Client()}
	s, err := c.CreateSession(CreateSessionInput{
		Path:               "/p/v2/cli/sessions",
		RequestedOperation: "updateDefensiveModeStatus",
	})
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	if gotMethod != "POST" {
		t.Errorf("method = %q, want POST", gotMethod)
	}
	if gotPath != "/p/v2/cli/sessions" {
		t.Errorf("path = %q", gotPath)
	}
	if gotIdem == "" {
		t.Error("Idempotency-Key header must be set")
	}
	var body map[string]string
	if err := json.Unmarshal([]byte(gotBody), &body); err != nil {
		t.Fatalf("body parse: %v", err)
	}
	if body["clientType"] != "cli" {
		t.Errorf("clientType = %q", body["clientType"])
	}
	if body["requestedOperation"] != "updateDefensiveModeStatus" {
		t.Errorf("requestedOperation = %q", body["requestedOperation"])
	}
	if s.ChallengeID != "abc" || s.Status != StatusPending {
		t.Errorf("session decode bad: %+v", s)
	}
}

func TestClientGetSessionStatus(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Write([]byte(`{"challengeId":"abc","status":"verified","expiresAt":"2026-06-05T12:00:00Z","provider":"passkeys","pollIntervalSeconds":2}`))
	}))
	defer srv.Close()
	c := &Client{APIHost: srv.URL, HTTP: srv.Client()}
	ss, err := c.GetSessionStatus(GetSessionStatusInput{
		Template:    srv.URL + "/p/v2/cli/sessions/{challengeId}",
		ChallengeID: "abc",
		Scope:       "x",
	})
	if err != nil {
		t.Fatalf("GetSessionStatus: %v", err)
	}
	if gotPath != "/p/v2/cli/sessions/abc" {
		t.Errorf("path = %q", gotPath)
	}
	if ss.Status != StatusVerified || ss.Provider != "passkeys" {
		t.Errorf("status decode bad: %+v", ss)
	}
}

func TestClientGetSessionStatusURLEncodesChallengeID(t *testing.T) {
	// Use RequestURI (the raw URI as sent over the wire). r.URL.Path is the
	// decoded form, which can't distinguish the encoded slash from a literal one.
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.RequestURI
		w.Write([]byte(`{"challengeId":"a/b","status":"pending","expiresAt":"2026-06-05T12:00:00Z","pollIntervalSeconds":2}`))
	}))
	defer srv.Close()
	c := &Client{APIHost: srv.URL, HTTP: srv.Client()}
	_, err := c.GetSessionStatus(GetSessionStatusInput{
		Template:    srv.URL + "/p/v2/cli/sessions/{challengeId}",
		ChallengeID: "a/b",
	})
	if err != nil {
		t.Fatalf("GetSessionStatus: %v", err)
	}
	if !strings.Contains(gotPath, "a%2Fb") {
		t.Errorf("path %q must URL-encode challengeId", gotPath)
	}
}

func TestClientExchange(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"elevatedToken":{"token":"elev","expiresAt":"2026-06-05T13:00:00Z","purpose":"u"}}`))
	}))
	defer srv.Close()
	c := &Client{APIHost: srv.URL, HTTP: srv.Client()}
	res, err := c.Exchange(ExchangeInput{
		Template:    srv.URL + "/p/v2/cli/sessions/{challengeId}/elevated-token",
		ChallengeID: "abc",
	})
	if err != nil {
		t.Fatalf("Exchange: %v", err)
	}
	if res.ElevatedToken.Token != "elev" {
		t.Errorf("token = %q", res.ElevatedToken.Token)
	}
}

func TestClientHttpErrorOnNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
		w.Write([]byte("service unavailable"))
	}))
	defer srv.Close()
	c := &Client{APIHost: srv.URL, HTTP: srv.Client()}
	_, err := c.CreateSession(CreateSessionInput{
		Path:               "/x",
		RequestedOperation: "u",
	})
	if err == nil {
		t.Fatal("expected error on 503")
	}
	var herr *HttpError
	if !errors.As(err, &herr) {
		t.Fatalf("err is %T, want *HttpError", err)
	}
	if herr.StatusCode() != 503 {
		t.Errorf("statusCode = %d, want 503", herr.StatusCode())
	}
}

func TestClientRejectsCrossOriginRechallengeURL(t *testing.T) {
	var foreignHits atomic.Int32
	foreign := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		foreignHits.Add(1)
		w.Write([]byte(`{"challengeId":"abc","status":"pending","expiresAt":"2026-06-05T12:00:00Z","pollIntervalSeconds":2}`))
	}))
	defer foreign.Close()

	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer api.Close()

	c := &Client{APIHost: api.URL, BearerToken: "primary-token", HTTP: api.Client()}
	_, err := c.GetSessionStatus(GetSessionStatusInput{
		Template:    foreign.URL + "/p/v2/cli/sessions/{challengeId}",
		ChallengeID: "abc",
		Scope:       "updateDefensiveModeStatus",
	})
	if err == nil {
		t.Fatal("expected cross-origin rechallenge URL to be rejected")
	}
	if got := foreignHits.Load(); got != 0 {
		t.Errorf("foreign server hits = %d, want 0", got)
	}
}

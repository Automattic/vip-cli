package rechallenge

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const fakeBearer = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.c2lnbmF0dXJlLWJ5dGVz"

func TestRedactSecrets(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		secrets []string
		absent  []string
		present []string
	}{
		{
			name:    "known secret is replaced verbatim",
			in:      "upstream rejected Authorization: Bearer " + fakeBearer,
			secrets: []string{fakeBearer},
			absent:  []string{fakeBearer},
			present: []string{"upstream rejected"},
		},
		{
			name:    "a JWT we were never handed is still caught",
			in:      `{"echo":{"headers":{"authorization":"Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJvdGhlciJ9.xyz"}}}`,
			secrets: nil,
			absent:  []string{"eyJhbGciOiJub25lIn0.eyJzdWIiOiJvdGhlciJ9.xyz"},
		},
		{
			// The unanchored seg.seg.seg pattern would eat this, gutting the
			// diagnosis the surfaced reason exists to provide.
			name:    "dotted hostnames survive",
			in:      "step-up provider parker-service.production.example refused the request",
			present: []string{"parker-service.production.example"},
		},
		{
			name:    "empty secret does not blank the whole string",
			in:      "session window elapsed",
			secrets: []string{""},
			present: []string{"session window elapsed"},
		},
		{
			name:    "ordinary text is untouched",
			in:      "Step-up verification did not complete (status=cancelled): user cancelled.",
			present: []string{"user cancelled"},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := RedactSecrets(tc.in, tc.secrets...)
			for _, a := range tc.absent {
				if strings.Contains(got, a) {
					t.Errorf("redacted text still contains %q: %s", a, got)
				}
			}
			for _, p := range tc.present {
				if !strings.Contains(got, p) {
					t.Errorf("redacted text lost %q: %s", p, got)
				}
			}
		})
	}
}

// TestHttpErrorRedactsBearerToken: Parker echoes request context into some
// error payloads, and these error strings now reach the user's terminal, CI
// logs, and the telemetry exit hook. The response body must never be able to
// carry the bearer token back out.
func TestHttpErrorRedactsBearerToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		// Worst case: the server reflects the request it received.
		w.Write([]byte(`{"error":"forbidden","request":{"authorization":"Bearer ` +
			r.Header.Get("Authorization") + `"}}`))
	}))
	defer srv.Close()

	c := &Client{APIHost: srv.URL, HTTP: srv.Client(), BearerToken: fakeBearer}
	_, err := c.CreateSession(CreateSessionInput{Path: "/x", RequestedOperation: "op"})
	if err == nil {
		t.Fatal("want an error for HTTP 403")
	}
	if strings.Contains(err.Error(), fakeBearer) {
		t.Fatalf("bearer token leaked into error text: %s", err.Error())
	}
	if !strings.Contains(err.Error(), "forbidden") {
		t.Errorf("redaction ate the diagnosis; want the server reason, got: %s", err.Error())
	}

	var herr *HttpError
	if !errors.As(err, &herr) {
		t.Fatalf("err = %T, want *HttpError", err)
	}
	if strings.Contains(herr.BodyText(), fakeBearer) {
		t.Errorf("bearer token leaked via BodyText(): %s", herr.BodyText())
	}
}

// TestFlowRedactsStatusReason: statusReason.message is server-controlled text
// that lands in the TerminalError the user sees.
func TestFlowRedactsStatusReason(t *testing.T) {
	hour := time.Now().Add(time.Hour).Format(time.RFC3339)
	mux := http.NewServeMux()
	mux.HandleFunc("/p/sessions", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v","pollIntervalSeconds":0,"expiresAt":"` + hour + `"}`))
	})
	mux.HandleFunc("/p/sessions/c1", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"failed","expiresAt":"` + hour +
			`","pollIntervalSeconds":0,"statusReason":{"code":"x","message":"denied for token ` + fakeBearer + `"}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	r := &Runner{
		Client:     &Client{APIHost: srv.URL, HTTP: srv.Client(), BearerToken: fakeBearer},
		Tracker:    &fakeTracker{},
		TokenCache: newTestCache(),
		Stdout:     new(strings.Builder),
		Sleep:      func(context.Context, time.Duration) error { return nil },
	}
	_, err := r.Run(context.Background(), RunInput{
		RequestedOperation: "op",
		Interactive:        true,
		Extension:          testExtension(srv.URL),
	})
	if err == nil {
		t.Fatal("want a TerminalError")
	}
	if strings.Contains(err.Error(), fakeBearer) {
		t.Fatalf("bearer token leaked via statusReason: %s", err.Error())
	}
	if !strings.Contains(err.Error(), "denied for token") {
		t.Errorf("the server's reason must survive redaction; got: %s", err.Error())
	}
}

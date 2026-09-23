package telemetry

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestPendoTokenChangesAndRemoval(t *testing.T) {
	var headers []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		headers = append(headers, r.Header.Get("Authorization"))
	}))
	defer srv.Close()
	token := "first-token"
	c := &PendoClient{Endpoint: srv.URL, HTTP: srv.Client(), GetToken: func() (string, error) { return token, nil }}
	for _, next := range []string{"first-token", "replacement-token", ""} {
		token = next
		if err := c.TrackEvent("test", nil); err != nil {
			t.Fatal(err)
		}
	}
	if len(headers) != 2 || headers[0] != "Bearer first-token" || headers[1] != "Bearer replacement-token" {
		t.Fatalf("authentication did not follow token changes: %v", headers)
	}
}

func TestPendoMissingCredentialsSkipsRequestAndIdentityLookup(t *testing.T) {
	for _, getToken := range []func() (string, error){nil, func() (string, error) { return "", nil }, func() (string, error) { return "", errors.New("PRIVATE_STORE_ERROR") }} {
		var diagnostics bytes.Buffer
		c := &PendoClient{
			Endpoint: ":invalid", GetToken: getToken,
			Context:   debuglog.WithLogger(context.Background(), "*", &diagnostics),
			GetUserID: func() string { t.Fatal("no-token event accessed the identity store"); return "" },
		}
		if err := c.TrackEvent("test", nil); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(diagnostics.String(), "Skipping event") || strings.Contains(diagnostics.String(), "PRIVATE_STORE_ERROR") {
			t.Fatalf("unexpected diagnostics: %s", &diagnostics)
		}
	}
}

func TestPendoDiagnosticsAndNonfatalFailures(t *testing.T) {
	for _, selector := range []string{"", "@automattic/vip:analytics:clients:pendo", "*,-@automattic/vip:analytics:clients:pendo"} {
		t.Run(selector, func(t *testing.T) {
			for _, name := range []string{"DO_NOT_TRACK", "GO_ENV", "NODE_ENV"} {
				t.Setenv(name, "")
			}
			var diagnostics bytes.Buffer
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte("PRIVATE_RESPONSE"))
			}))
			defer srv.Close()
			pendo := &PendoClient{Endpoint: srv.URL, HTTP: srv.Client(), UserID: "PRIVATE_ID"}
			other := &fakeClient{}
			tr := &Tracker{Clients: []Client{pendo, other}}
			tr.SetPendoTokenSource(func() (string, error) { return "PRIVATE_TOKEN", nil })
			tr.SetContext(debuglog.WithLogger(context.Background(), selector, &diagnostics))
			tr.TrackEvent("test", map[string]any{"value": "PRIVATE_PAYLOAD"})
			if len(other.events) != 1 {
				t.Fatal("Pendo failure prevented other telemetry")
			}
			if strings.Contains(diagnostics.String(), "PRIVATE_") {
				t.Fatalf("private data in diagnostics: %s", &diagnostics)
			}
			wantLog := selector == "@automattic/vip:analytics:clients:pendo"
			if strings.Contains(diagnostics.String(), "401") != wantLog {
				t.Fatalf("missing or unfiltered status: %s", &diagnostics)
			}
		})
	}
}

func TestPendoTrackingOptOutAvoidsCredentials(t *testing.T) {
	for _, name := range []string{"DO_NOT_TRACK", "GO_ENV", "NODE_ENV"} {
		t.Run(name, func(t *testing.T) {
			t.Setenv(name, "test")
			tr := &Tracker{Clients: []Client{&PendoClient{}}}
			tr.SetPendoTokenSource(func() (string, error) { t.Fatal("tracking opt-out accessed credentials"); return "", nil })
			tr.TrackEvent("test", nil)
		})
	}
}

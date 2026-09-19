package telemetry

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestTracksClientPostsExpectedForm(t *testing.T) {
	var body string
	var ua string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ua = r.Header.Get("User-Agent")
		b, _ := io.ReadAll(r.Body)
		body = string(b)
		w.WriteHeader(200)
	}))
	defer srv.Close()
	c := &TracksClient{
		Endpoint:  srv.URL,
		UserID:    "anon-uuid",
		UserType:  TracksAnonUserType,
		UserAgent: "vip-next/test1.0",
	}
	if err := c.TrackEvent("whoami_command_execute", map[string]any{"command": "vip whoami"}); err != nil {
		t.Fatalf("TrackEvent: %v", err)
	}
	if ua != "vip-next/test1.0" {
		t.Errorf("User-Agent = %q, want vip-next/test1.0", ua)
	}
	v, err := url.ParseQuery(body)
	if err != nil {
		t.Fatalf("body not form-encoded: %v", err)
	}
	if v.Get("events[0][_en]") != "vip_cli_whoami_command_execute" {
		t.Errorf("event name = %q, want vip_cli_whoami_command_execute", v.Get("events[0][_en]"))
	}
	if v.Get("events[0][command]") != "vip whoami" {
		t.Errorf("event prop = %q", v.Get("events[0][command]"))
	}
	if v.Get("commonProps[_ui]") != "anon-uuid" {
		t.Errorf("commonProps[_ui] = %q", v.Get("commonProps[_ui]"))
	}
	if v.Get("commonProps[_ut]") != "anon" {
		t.Errorf("commonProps[_ut] = %q", v.Get("commonProps[_ut]"))
	}
}

func TestTracksClientHonorsExplicitPrefix(t *testing.T) {
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		body = string(b)
	}))
	defer srv.Close()
	c := &TracksClient{Endpoint: srv.URL, UserID: "u", UserType: "anon", UserAgent: "x"}
	c.TrackEvent("vip_cli_already_prefixed", nil)
	v, _ := url.ParseQuery(body)
	if v.Get("events[0][_en]") != "vip_cli_already_prefixed" {
		t.Errorf("event name = %q (must not double-prefix)", v.Get("events[0][_en]"))
	}
}

func TestTracksClientSendsBinaryKind(t *testing.T) {
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		body = string(b)
	}))
	defer srv.Close()
	c := &TracksClient{Endpoint: srv.URL, UserID: "u", UserType: "anon", UserAgent: "x"}
	c.TrackEvent("test", nil)
	v, _ := url.ParseQuery(body)
	if v.Get("events[0][cli_binary_kind]") != "go-native" {
		t.Errorf("expected cli_binary_kind=go-native; body=%s", body)
	}
	if !strings.Contains(body, "cli_binary_kind") {
		t.Errorf("body missing cli_binary_kind: %s", body)
	}
}

func TestTracksClientLazyUserIDResolved(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	defer srv.Close()

	c := &TracksClient{
		Endpoint:  srv.URL,
		GetUserID: func() string { calls++; return "lazy-uuid" },
		UserType:  "anon",
		UserAgent: "vip-next/test",
	}
	// Before TrackEvent: GetUserID must not be called.
	if calls != 0 {
		t.Errorf("GetUserID called %d times before TrackEvent; want 0", calls)
	}
	c.TrackEvent("test", nil)
	if calls != 1 {
		t.Errorf("GetUserID called %d times after TrackEvent; want 1", calls)
	}
}

func TestTracksClientPrefersExplicitUserID(t *testing.T) {
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		body = string(b)
		w.WriteHeader(200)
	}))
	defer srv.Close()

	c := &TracksClient{
		Endpoint:  srv.URL,
		UserID:    "explicit",
		GetUserID: func() string { t.Error("GetUserID must not be called when UserID is set"); return "" },
		UserType:  "anon",
		UserAgent: "x",
	}
	c.TrackEvent("test", nil)
	v, _ := url.ParseQuery(body)
	if v.Get("commonProps[_ui]") != "explicit" {
		t.Errorf("commonProps[_ui] = %q, want explicit", v.Get("commonProps[_ui]"))
	}
}

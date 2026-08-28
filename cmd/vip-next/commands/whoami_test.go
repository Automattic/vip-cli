package commands

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWhoamiSendsBearerToken(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("Authorization")
		w.Write([]byte(`{"data":{"me":{"id":1,"displayName":"x"}}}`))
	}))
	defer srv.Close()
	var stdout bytes.Buffer
	if err := RunWhoami(WhoamiDeps{APIHost: srv.URL, Token: "test-jwt-token", Stdout: &stdout}); err != nil {
		t.Fatalf("RunWhoami: %v", err)
	}
	if got != "Bearer test-jwt-token" {
		t.Errorf("Authorization = %q, want Bearer test-jwt-token", got)
	}
}

func TestWhoamiSuccessOutput(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{"me":{"id":42,"displayName":"Test User","trackingUserId":"42","isVIP":true}}}`))
	}))
	defer srv.Close()
	var stdout bytes.Buffer
	err := RunWhoami(WhoamiDeps{APIHost: srv.URL, Stdout: &stdout})
	if err != nil {
		t.Fatalf("RunWhoami: %v", err)
	}
	got := stdout.String()
	want := "- Howdy Test User!\n- Your user ID is 42\n- Your account has VIP Staff permissions\n"
	if got != want {
		t.Errorf("output mismatch:\n got: %q\nwant: %q", got, want)
	}
}

func TestWhoamiNoDisplayName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"data":{"me":{"id":7}}}`))
	}))
	defer srv.Close()
	var stdout bytes.Buffer
	err := RunWhoami(WhoamiDeps{APIHost: srv.URL, Stdout: &stdout})
	if err != nil {
		t.Fatalf("RunWhoami: %v", err)
	}
	if !strings.Contains(stdout.String(), "- Howdy user!") {
		t.Errorf("missing default displayName: %q", stdout.String())
	}
}

func TestWhoamiNoIDPrintsNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"data":{"me":{"displayName":"x"}}}`))
	}))
	defer srv.Close()
	var stdout bytes.Buffer
	RunWhoami(WhoamiDeps{APIHost: srv.URL, Stdout: &stdout})
	if !strings.Contains(stdout.String(), "- Your user ID is  not found") {
		t.Errorf("missing not-found marker (note leading space): %q", stdout.String())
	}
}

func TestWhoamiNullMeReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"data":{"me":null}}`))
	}))
	defer srv.Close()
	var stdout bytes.Buffer
	err := RunWhoami(WhoamiDeps{APIHost: srv.URL, Stdout: &stdout})
	if err == nil {
		t.Fatal("expected an error when me is null")
	}
	if !strings.Contains(err.Error(), "The API did not return any information about the user.") {
		t.Errorf("error message mismatch: %v", err)
	}
}

package commands

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
)

// memBackendLogout is an in-memory keychain Backend for logout tests.
// Mirrors the same helper used in internal/auth/store_test.go but lives
// in this package so it can be used with commands.Config injection.
type memBackendLogout struct{ store map[string]string }

func (m *memBackendLogout) Set(s, u, p string) error {
	if m.store == nil {
		m.store = map[string]string{}
	}
	m.store[s+"|"+u] = p
	return nil
}
func (m *memBackendLogout) Get(s, u string) (string, error) {
	if v, ok := m.store[s+"|"+u]; ok {
		return v, nil
	}
	return "", keychain.ErrNotFound
}
func (m *memBackendLogout) Delete(s, u string) error {
	if _, ok := m.store[s+"|"+u]; !ok {
		return keychain.ErrNotFound
	}
	delete(m.store, s+"|"+u)
	return nil
}

// runLogoutCmd drives LogoutCmd end-to-end with an injected keychain and an
// httptest server acting as the API. It returns the captured stdout and any
// error returned by RunE.
//
// Since LogoutCmd calls keychain.New(cfg.APIHost) internally — which picks the
// OS keyring, or the 0600 file fallback on a headless box — we cannot intercept
// that call without modifying the command's signature. Instead, we:
//  1. Set cfg.APIHost to the test server URL. The command calls keychain.New
//     with that URL, which creates a Keychain with a real backend. On
//     Delete that returns ErrNotFound (no token stored under the test
//     service name), which the command swallows (Node parity: logout is
//     idempotent).
//  2. We verify token-purge behaviour by directly exercising auth.Store with
//     a memBackend — that path is already covered in internal/auth/store_test.go.
//  3. We assert: command exits 0, stdout contains the success message, and
//     PostLogout is called with the correct bearer token.
func runLogoutCmd(t *testing.T, srv *httptest.Server) (string, error) {
	t.Helper()
	SetConfig(Config{APIHost: srv.URL})
	defer SetConfig(Config{})

	cmd := LogoutCmd()
	var out bytes.Buffer
	cmd.SetOut(&out)
	err := cmd.RunE(cmd, nil)
	return out.String(), err
}

// TestLogoutCmdNoToken verifies that running logout when there is no stored
// token exits 0 (idempotent, Node parity).
func TestLogoutCmdNoToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Should NOT be called when no token is present (store.Load returns error).
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runLogoutCmd(t, srv)
	if err != nil {
		t.Fatalf("LogoutCmd with no token: expected nil error, got %v", err)
	}
	if !strings.Contains(out, "You are now logged out.") {
		t.Errorf("expected logout message in output, got: %q", out)
	}
}

// TestLogoutCmdWithToken verifies that when a token is present (via
// VIP_TOKEN_OVERRIDE), PostLogout is called with the Bearer token and the
// command still exits 0. The actual keychain deletion is tested in
// internal/auth/store_test.go with a memBackend — here we focus on the
// command plumbing: correct HTTP call + success output.
//
// GO_ENV=test is required since cutover item 2.15: the override is a test-only
// hatch (Node gates the same variable on NODE_ENV=test, src/lib/token.ts:105).
func TestLogoutCmdWithToken(t *testing.T) {
	const testToken = "test-bearer-token"

	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/logout" && r.Method == http.MethodPost {
			gotAuth = r.Header.Get("Authorization")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	t.Setenv("GO_ENV", "test")
	t.Setenv("VIP_TOKEN_OVERRIDE", testToken)

	out, err := runLogoutCmd(t, srv)
	if err != nil {
		t.Fatalf("LogoutCmd with token: expected nil error, got %v", err)
	}
	if gotAuth != "Bearer "+testToken {
		t.Errorf("PostLogout Authorization = %q, want %q", gotAuth, "Bearer "+testToken)
	}
	if !strings.Contains(out, "You are now logged out.") {
		t.Errorf("expected logout message in output, got: %q", out)
	}
}

// TestLogoutCmdTokenPurge verifies that after logout, the token is gone from
// the store. This is a unit-level test over auth.Store + memBackend — the
// actual end-to-end token path is covered here without touching the OS keychain.
func TestLogoutCmdTokenPurge(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	backend := &memBackendLogout{}
	k := &keychain.Keychain{
		Backend:       backend,
		Service:       "vip-next-cli",
		LegacyService: "vip-go-cli",
	}
	store := auth.NewStore(k)
	if err := backend.Set("vip-go-cli", "vip-go-cli", "legacy-token"); err != nil {
		t.Fatalf("seed legacy token: %v", err)
	}
	if err := store.Save("primary-token"); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Verify token is present.
	tok, err := store.Load()
	if err != nil || tok != "primary-token" {
		t.Fatalf("precondition: Load = %q, %v", tok, err)
	}

	// Simulate what LogoutCmd does: delete the token.
	if err := store.Delete(); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if got := backend.store["vip-go-cli|vip-go-cli"]; got != "legacy-token" {
		t.Fatalf("legacy token = %q, want unchanged legacy-token", got)
	}
	if _, err := store.Load(); !errors.Is(err, auth.ErrNoToken) {
		t.Fatalf("Load after logout = %v, want ErrNoToken", err)
	}
}

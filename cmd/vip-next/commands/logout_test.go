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
	"github.com/Automattic/vip/internal/rechallenge"
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

// runLogoutCmd exercises the command with an isolated credential backend.
func runLogoutCmd(t *testing.T, srv *httptest.Server, k *keychain.Keychain) (string, error) {
	t.Helper()
	SetConfig(Config{APIHost: srv.URL})
	defer SetConfig(Config{})

	cmd := logoutCmd(func(string) *keychain.Keychain { return k })
	var out bytes.Buffer
	cmd.SetOut(&out)
	err := cmd.RunE(cmd, nil)
	return out.String(), err
}

// TestLogoutCmdNoToken verifies that running logout when there is no stored
// token exits 0 (idempotent, Node parity).
func TestLogoutCmdNoToken(t *testing.T) {
	t.Setenv("VIP_CLI_TOKEN", "")
	k := logoutTestKeychain()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Should NOT be called when no token is present (store.Load returns error).
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runLogoutCmd(t, srv, k)
	if err != nil {
		t.Fatalf("LogoutCmd with no token: expected nil error, got %v", err)
	}
	if !strings.Contains(out, "You are now logged out.") {
		t.Errorf("expected logout message in output, got: %q", out)
	}
}

// TestLogoutCmdWithToken checks revocation and deletion of the same stored PAT.
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

	t.Setenv("VIP_CLI_TOKEN", "")
	k := logoutTestKeychain()
	if err := auth.NewStore(k).Save(testToken); err != nil {
		t.Fatal(err)
	}
	if err := k.Backend.Set(k.LegacyService, k.LegacyService, "legacy-token"); err != nil {
		t.Fatal(err)
	}
	elevated := rechallenge.ServiceNameForHost(srv.URL)
	if err := k.Backend.Set(elevated, elevated, "cached-elevation"); err != nil {
		t.Fatal(err)
	}

	out, err := runLogoutCmd(t, srv, k)
	if err != nil {
		t.Fatalf("LogoutCmd with token: expected nil error, got %v", err)
	}
	if gotAuth != "Bearer "+testToken {
		t.Errorf("PostLogout Authorization = %q, want %q", gotAuth, "Bearer "+testToken)
	}
	if !strings.Contains(out, "You are now logged out.") {
		t.Errorf("expected logout message in output, got: %q", out)
	}
	if _, err := k.Get(k.Account()); !errors.Is(err, keychain.ErrNotFound) {
		t.Fatalf("primary token survived logout: %v", err)
	}
	if _, err := k.Backend.Get(elevated, elevated); !errors.Is(err, keychain.ErrNotFound) {
		t.Fatalf("elevated cache survived logout: %v", err)
	}
	if got, err := k.Backend.Get(k.LegacyService, k.LegacyService); err != nil || got != "legacy-token" {
		t.Fatalf("legacy token changed: %v", err)
	}
}

// TestLogoutCmdTokenPurge verifies that after logout, the token is gone from
// the store. This is a unit-level test over auth.Store + memBackend — the
// actual end-to-end token path is covered here without touching the OS keychain.
func TestLogoutCmdTokenPurge(t *testing.T) {
	t.Setenv("VIP_CLI_TOKEN", "")
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

func TestLogoutCmdEnvironmentPATDoesNotRevokeStoredToken(t *testing.T) {
	k := logoutTestKeychain()
	if err := auth.NewStore(k).Save("stored-token"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("VIP_CLI_TOKEN", "environment-token")
	var logoutHits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/logout" {
			logoutHits++
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runLogoutCmd(t, srv, k)
	if err != nil {
		t.Fatalf("LogoutCmd: %v", err)
	}
	if logoutHits != 0 || !strings.Contains(out, "VIP_CLI_TOKEN") {
		t.Fatalf("logout hits = %d, output = %q; want no revocation and environment guidance", logoutHits, out)
	}
	if got, err := k.Get(k.Account()); err != nil || got != "stored-token" {
		t.Fatalf("stored token changed: %v", err)
	}
}

func logoutTestKeychain() *keychain.Keychain {
	return &keychain.Keychain{Backend: &memBackendLogout{}, Service: "vip-next-cli", LegacyService: "vip-go-cli"}
}

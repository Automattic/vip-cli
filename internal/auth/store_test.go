package auth

import (
	"errors"
	"os"
	"testing"

	"github.com/Automattic/vip/internal/keychain"
)

type memBackend struct{ store map[string]string }

func (m *memBackend) Set(s, u, p string) error {
	if m.store == nil {
		m.store = map[string]string{}
	}
	m.store[s+"|"+u] = p
	return nil
}
func (m *memBackend) Get(s, u string) (string, error) {
	if v, ok := m.store[s+"|"+u]; ok {
		return v, nil
	}
	return "", keychain.ErrNotFound
}
func (m *memBackend) Delete(s, u string) error {
	if _, ok := m.store[s+"|"+u]; !ok {
		return keychain.ErrNotFound
	}
	delete(m.store, s+"|"+u)
	return nil
}

func newTestStore() *Store {
	k := &keychain.Keychain{
		Backend:       &memBackend{},
		Service:       "vip-next-cli",
		LegacyService: "vip-go-cli",
	}
	return NewStore(k)
}

func TestStoreSaveAndLoad(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	s := newTestStore()
	if err := s.Save("jwt.payload.sig"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := s.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got != "jwt.payload.sig" {
		t.Errorf("Load = %q, want %q", got, "jwt.payload.sig")
	}
}

func TestStoreLoadFallsBackToLegacyWhenPrimaryMissing(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	s := newTestStore()
	be := s.K.Backend.(*memBackend)
	if err := be.Set("vip-go-cli", "vip-go-cli", "legacy-token"); err != nil {
		t.Fatalf("seed legacy token: %v", err)
	}

	got, err := s.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got != "legacy-token" {
		t.Fatalf("Load = %q, want legacy-token", got)
	}
}

func TestStoreLoadPrimaryDoesNotReturnLegacyToken(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	s := newTestStore()
	be := s.K.Backend.(*memBackend)
	if err := be.Set("vip-go-cli", "vip-go-cli", "legacy-token"); err != nil {
		t.Fatalf("seed legacy token: %v", err)
	}

	if _, err := s.LoadPrimary(); !errors.Is(err, ErrNoToken) {
		t.Fatalf("LoadPrimary = %v, want ErrNoToken", err)
	}
}

func TestStoreLoadPrefersPrimaryEvenWhenInvalid(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	s := newTestStore()
	be := s.K.Backend.(*memBackend)
	if err := be.Set("vip-go-cli", "vip-go-cli", "valid-legacy-token"); err != nil {
		t.Fatalf("seed legacy token: %v", err)
	}
	if err := be.Set("vip-next-cli", "vip-next-cli", "invalid-primary"); err != nil {
		t.Fatalf("seed primary token: %v", err)
	}

	got, err := s.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got != "invalid-primary" {
		t.Fatalf("Load = %q, want invalid-primary", got)
	}
}

func TestStoreSaveWritesOnlyPrimaryAndClearsFallbackMarker(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	s := newTestStore()
	be := s.K.Backend.(*memBackend)
	if err := be.Set("vip-go-cli", "vip-go-cli", "legacy-token"); err != nil {
		t.Fatalf("seed legacy token: %v", err)
	}
	if err := be.Set("vip-next-cli", "vip-next-cli:legacy-fallback-disabled", "1"); err != nil {
		t.Fatalf("seed fallback marker: %v", err)
	}

	if err := s.Save("new-token"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if got := be.store["vip-next-cli|vip-next-cli"]; got != "new-token" {
		t.Fatalf("primary token = %q, want new-token", got)
	}
	if got := be.store["vip-go-cli|vip-go-cli"]; got != "legacy-token" {
		t.Fatalf("Save changed the legacy token to %q", got)
	}
	if _, ok := be.store["vip-next-cli|vip-next-cli:legacy-fallback-disabled"]; ok {
		t.Fatal("Save did not clear the legacy-fallback marker")
	}
}

func TestStoreDeleteLeavesLegacyAndDisablesFallback(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	s := newTestStore()
	be := s.K.Backend.(*memBackend)
	if err := be.Set("vip-go-cli", "vip-go-cli", "legacy-token"); err != nil {
		t.Fatalf("seed legacy token: %v", err)
	}
	if err := s.Save("primary-token"); err != nil {
		t.Fatalf("Save: %v", err)
	}

	if err := s.Delete(); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if got := be.store["vip-go-cli|vip-go-cli"]; got != "legacy-token" {
		t.Fatalf("legacy token = %q, want unchanged legacy-token", got)
	}
	if _, err := s.Load(); !errors.Is(err, ErrNoToken) {
		t.Fatalf("Load after Delete = %v, want ErrNoToken", err)
	}
}

func TestStoreDeleteWithoutPrimaryStillDisablesLegacyFallback(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	s := newTestStore()
	be := s.K.Backend.(*memBackend)
	if err := be.Set("vip-go-cli", "vip-go-cli", "legacy-token"); err != nil {
		t.Fatalf("seed legacy token: %v", err)
	}

	if err := s.Delete(); !errors.Is(err, ErrNoToken) {
		t.Fatalf("Delete without primary = %v, want ErrNoToken", err)
	}
	if got := be.store["vip-go-cli|vip-go-cli"]; got != "legacy-token" {
		t.Fatalf("legacy token = %q, want unchanged legacy-token", got)
	}
	if _, err := s.Load(); !errors.Is(err, ErrNoToken) {
		t.Fatalf("Load after Delete = %v, want ErrNoToken", err)
	}
}

func TestStoreLoadMissingReturnsNotFound(t *testing.T) {
	s := newTestStore()
	_, err := s.Load()
	if !errors.Is(err, ErrNoToken) {
		t.Errorf("err = %v, want ErrNoToken", err)
	}
}

func TestStoreDelete(t *testing.T) {
	s := newTestStore()
	s.Save("x")
	if err := s.Delete(); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	_, err := s.Load()
	if !errors.Is(err, ErrNoToken) {
		t.Errorf("after Delete: err = %v, want ErrNoToken", err)
	}
}

// TestStoreLoadIgnoresOverrideOutsideTestMode pins cutover item 2.15.
// Node honours VIP_TOKEN_OVERRIDE only under NODE_ENV=test
// (src/lib/token.ts:105); vip-next honoured it unconditionally, which turned a
// test escape hatch into a live production auth path. GO_ENV is the Go-side
// equivalent this repo already uses (internal/telemetry/tracker.go:83,
// internal/parity/env.go pins both).
func TestStoreLoadIgnoresOverrideOutsideTestMode(t *testing.T) {
	for _, mode := range []map[string]string{
		{"GO_ENV": "", "NODE_ENV": ""},
		{"GO_ENV": "production", "NODE_ENV": "production"},
		{"GO_ENV": "development", "NODE_ENV": ""},
	} {
		for k, v := range mode {
			t.Setenv(k, v)
		}
		t.Setenv("VIP_TOKEN_OVERRIDE", "ambient-attacker-token")

		s := newTestStore()
		if err := s.Save("keychain-token"); err != nil {
			t.Fatalf("Save: %v", err)
		}
		got, err := s.Load()
		if err != nil {
			t.Fatalf("Load (%v): %v", mode, err)
		}
		if got != "keychain-token" {
			t.Errorf("Load with %v = %q, want the stored credential", mode, got)
		}
		primary, err := s.LoadPrimary()
		if err != nil {
			t.Fatalf("LoadPrimary (%v): %v", mode, err)
		}
		if primary != "keychain-token" {
			t.Errorf("LoadPrimary with %v = %q, want the stored credential", mode, primary)
		}
	}
}

// TestLogoutRevokesTheSameTokenItDeletes reproduces the compounding half of
// 2.15. `vip logout` reads the bearer to revoke with LoadPrimary and then purges
// the keychain with Delete. While the override was honoured unconditionally,
// those were two DIFFERENT tokens: `VIP_TOKEN_OVERRIDE=x vip-next logout`
// revoked x server-side and deleted the user's real credential locally, leaving
// a live session nobody could log out of.
func TestLogoutRevokesTheSameTokenItDeletes(t *testing.T) {
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("VIP_TOKEN_OVERRIDE", "some-other-session")

	s := newTestStore()
	if err := s.Save("the-credential-logout-will-delete"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	revoked, err := s.LoadPrimary()
	if err != nil {
		t.Fatalf("LoadPrimary: %v", err)
	}
	if err := s.Delete(); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if revoked != "the-credential-logout-will-delete" {
		t.Errorf("logout would revoke %q but delete the stored credential", revoked)
	}
}

// TestStoreLoadIgnoresOverrideWithNoStoredToken is the other half: outside test
// mode the override must not manufacture a session out of nothing.
func TestStoreLoadIgnoresOverrideWithNoStoredToken(t *testing.T) {
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("VIP_TOKEN_OVERRIDE", "ambient-attacker-token")

	s := newTestStore()
	if _, err := s.Load(); !errors.Is(err, ErrNoToken) {
		t.Errorf("Load = %v, want ErrNoToken", err)
	}
}

func TestStoreLoadHonorsOverride(t *testing.T) {
	t.Setenv("GO_ENV", "test")
	s := newTestStore()
	// Set a token in the keychain so we confirm the env var wins over it.
	if err := s.Save("keychain-token"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	t.Setenv("VIP_TOKEN_OVERRIDE", "override-token")
	got, err := s.Load()
	if err != nil {
		t.Fatalf("Load with override: %v", err)
	}
	if got != "override-token" {
		t.Errorf("Load = %q, want %q", got, "override-token")
	}
}

func TestStoreLoadHonorsOverrideWhenKeychainEmpty(t *testing.T) {
	t.Setenv("NODE_ENV", "test")
	s := newTestStore()
	// No token in keychain; env var should still provide a value.
	t.Setenv("VIP_TOKEN_OVERRIDE", "env-only-token")
	got, err := s.Load()
	if err != nil {
		t.Fatalf("Load with override (empty keychain): %v", err)
	}
	if got != "env-only-token" {
		t.Errorf("Load = %q, want %q", got, "env-only-token")
	}
}

// Ensure the override is not active when the env var is unset (regression guard).
func TestStoreLoadNoOverrideWhenEnvUnset(t *testing.T) {
	s := newTestStore()
	os.Unsetenv("VIP_TOKEN_OVERRIDE")
	_, err := s.Load()
	if !errors.Is(err, ErrNoToken) {
		t.Errorf("expected ErrNoToken without override, got %v", err)
	}
}

func TestStoreDeleteClearsElevatedCache(t *testing.T) {
	called := false
	s := newTestStore()
	s.OnDelete = func() error {
		called = true
		return nil
	}
	s.Save("x")
	if err := s.Delete(); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if !called {
		t.Error("OnDelete hook must fire after token removal")
	}
}

func TestStoreDeleteHookErrorIsNotFatal(t *testing.T) {
	s := newTestStore()
	s.OnDelete = func() error { return errors.New("hook boom") }
	s.Save("x")
	// Hook error must NOT mask successful token removal. Implementations can
	// log via debug but Delete returns nil on hook failure (Node's logout
	// proceeds even if tokenCache.clearAll throws).
	if err := s.Delete(); err != nil {
		t.Fatalf("Delete returned hook error; want nil so logout proceeds: %v", err)
	}
}

package auth

import (
	"errors"
	"strings"
	"testing"
	"time"

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
	t.Setenv("VIP_CLI_TOKEN", "")
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
	t.Setenv("VIP_CLI_TOKEN", "")
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
	t.Setenv("VIP_CLI_TOKEN", "")
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
	t.Setenv("VIP_CLI_TOKEN", "")
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
	t.Setenv("VIP_CLI_TOKEN", "")
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
	t.Setenv("VIP_CLI_TOKEN", "")
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
	t.Setenv("VIP_CLI_TOKEN", "")
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

// A retired test variable must neither replace a stored identity nor create
// a session, even when either runtime's test mode is enabled.
func TestStoreIgnoresRetiredTokenOverride(t *testing.T) {
	for _, mode := range []struct{ name, goEnv, nodeEnv string }{
		{"normal", "", ""}, {"go-test", "test", ""}, {"node-test", "", "test"},
	} {
		t.Run(mode.name, func(t *testing.T) {
			t.Setenv("GO_ENV", mode.goEnv)
			t.Setenv("NODE_ENV", mode.nodeEnv)
			t.Setenv("VIP_CLI_TOKEN", "")
			t.Setenv("VIP_TOKEN_OVERRIDE", "retired-override")
			s := newTestStore()
			if _, err := s.Load(); !errors.Is(err, ErrNoToken) {
				t.Fatalf("empty store: Load error = %v, want ErrNoToken", err)
			}
			if err := s.Save("stored-token"); err != nil {
				t.Fatal(err)
			}
			credential, err := s.Resolve()
			if err != nil || credential.Raw != "stored-token" || credential.Source != SourceStored {
				t.Fatalf("Resolve = %+v, %v; want stored identity", credential, err)
			}
			primary, err := s.LoadPrimary()
			if err != nil || primary != "stored-token" {
				t.Fatalf("LoadPrimary = %q, %v; want stored identity for revocation", primary, err)
			}
		})
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

func TestResolveEnvironmentPATBeforeKeychain(t *testing.T) {
	valid := makeJWT(t, map[string]any{"id": 7, "iat": time.Now().Add(-time.Minute).Unix()})
	t.Setenv("VIP_CLI_TOKEN", "  "+valid+"  ")
	// A nil keychain proves this path cannot attempt a keychain read.
	got, err := NewStore(nil).Resolve()
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got.Raw != valid || got.Source != SourceEnvironment {
		t.Fatalf("Resolve = %+v, want environment PAT", got)
	}
}

func TestResolveInvalidEnvironmentPATDoesNotFallBack(t *testing.T) {
	expired := makeJWT(t, map[string]any{"id": 7, "iat": time.Now().Add(-2 * time.Hour).Unix(), "exp": time.Now().Add(-time.Hour).Unix()})
	missingID := makeJWT(t, map[string]any{"iat": time.Now().Add(-time.Minute).Unix()})
	for _, tc := range []struct{ name, raw string }{
		{"malformed", "not-a-jwt"},
		{"expired", expired},
		{"missing-id", missingID},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("VIP_CLI_TOKEN", tc.raw)
			if _, err := NewStore(nil).Resolve(); err == nil || !strings.Contains(err.Error(), "VIP_CLI_TOKEN") {
				t.Fatalf("Resolve error = %v, want actionable environment-token error", err)
			}
		})
	}
}

func TestResolveBlankEnvironmentPATUsesStoredToken(t *testing.T) {
	t.Setenv("VIP_CLI_TOKEN", "   ")
	s := newTestStore()
	if err := s.Save("stored-token"); err != nil {
		t.Fatal(err)
	}
	got, err := s.Resolve()
	if err != nil || got.Raw != "stored-token" || got.Source != SourceStored {
		t.Fatalf("Resolve = %+v, %v; want stored-token source", got, err)
	}
}

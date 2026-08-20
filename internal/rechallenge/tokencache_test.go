package rechallenge

import (
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

func newTestCache() *TokenCache {
	return &TokenCache{
		Keychain: &keychain.Keychain{Backend: &memBackend{}, Service: "vip-next-cli:elevated"},
	}
}

func TestTokenCacheRoundTrip(t *testing.T) {
	c := newTestCache()
	tok := ElevatedToken{Token: "x", ExpiresAt: time.Now().Add(1 * time.Hour), Purpose: "u"}
	if err := c.Set("doThing", tok); err != nil {
		t.Fatalf("Set: %v", err)
	}
	got, err := c.Get("doThing")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got == nil || got.Token != "x" {
		t.Errorf("Get = %+v, want token x", got)
	}
}

func TestTokenCacheMissingReturnsNil(t *testing.T) {
	c := newTestCache()
	got, err := c.Get("absent")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got != nil {
		t.Errorf("Get(absent) = %+v, want nil", got)
	}
}

func TestTokenCacheExpiredEvicted(t *testing.T) {
	c := newTestCache()
	// Expires within the 5s grace window — counts as expired.
	c.Set("doThing", ElevatedToken{Token: "x", ExpiresAt: time.Now().Add(2 * time.Second)})
	got, err := c.Get("doThing")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got != nil {
		t.Errorf("expired token must be evicted; got %+v", got)
	}
	// Fresh cache reading the same backend must not see the entry either.
	c2 := &TokenCache{Keychain: c.Keychain}
	got2, _ := c2.Get("doThing")
	if got2 != nil {
		t.Errorf("after eviction the keychain blob must not contain doThing; got %+v", got2)
	}
}

func TestTokenCacheClearScope(t *testing.T) {
	c := newTestCache()
	c.Set("a", ElevatedToken{Token: "a", ExpiresAt: time.Now().Add(time.Hour)})
	c.Set("b", ElevatedToken{Token: "b", ExpiresAt: time.Now().Add(time.Hour)})
	if err := c.ClearScope("a"); err != nil {
		t.Fatalf("ClearScope: %v", err)
	}
	got, _ := c.Get("a")
	if got != nil {
		t.Errorf("a should be cleared")
	}
	got, _ = c.Get("b")
	if got == nil {
		t.Errorf("b should still be present")
	}
}

func TestTokenCacheClearAll(t *testing.T) {
	c := newTestCache()
	c.Set("a", ElevatedToken{Token: "a", ExpiresAt: time.Now().Add(time.Hour)})
	c.Set("b", ElevatedToken{Token: "b", ExpiresAt: time.Now().Add(time.Hour)})
	if err := c.ClearAll(); err != nil {
		t.Fatalf("ClearAll: %v", err)
	}
	gotA, _ := c.Get("a")
	gotB, _ := c.Get("b")
	if gotA != nil || gotB != nil {
		t.Errorf("ClearAll must drop everything; got a=%+v b=%+v", gotA, gotB)
	}
	be := c.Keychain.Backend.(*memBackend)
	if _, exists := be.store["vip-next-cli:elevated|vip-next-cli:elevated"]; exists {
		t.Errorf("keychain entry must be deleted after ClearAll")
	}
}

func TestTokenCacheCorruptedBlobIsReset(t *testing.T) {
	c := newTestCache()
	be := c.Keychain.Backend.(*memBackend)
	_ = be.Set("vip-next-cli:elevated", "vip-next-cli:elevated", "not-json")
	got, err := c.Get("anything")
	if err != nil {
		t.Fatalf("Get on corrupt blob should not error; got %v", err)
	}
	if got != nil {
		t.Errorf("corrupted blob should yield nil; got %+v", got)
	}
}

func TestServiceNameForElevatedTokens(t *testing.T) {
	if got := ServiceNameForHost("https://api.wpvip.com"); got != "vip-next-cli:elevated" {
		t.Errorf("prod = %q, want vip-next-cli:elevated", got)
	}
	if got := ServiceNameForHost("https://staging-api.wpvip.com:8443"); got != "vip-next-cli:elevated:https---staging-api-wpvip-com-8443" {
		t.Errorf("non-prod = %q", got)
	}
}

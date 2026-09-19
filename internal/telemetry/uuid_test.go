package telemetry

import (
	"errors"
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
	delete(m.store, s+"|"+u)
	return nil
}

func newTestUUIDStore() *UUIDStore {
	return &UUIDStore{
		Keychain: &keychain.Keychain{Backend: &memBackend{}, Service: "vip-next-cli"},
	}
}

func TestGetUUIDGeneratesAndPersistsWhenMissing(t *testing.T) {
	s := newTestUUIDStore()
	id1, err := s.Get()
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if id1 == "" {
		t.Error("generated UUID is empty")
	}
	id2, _ := s.Get()
	if id1 != id2 {
		t.Errorf("second Get returned different UUID: %q vs %q", id1, id2)
	}
}

func TestSetUUIDPersistsExplicitValue(t *testing.T) {
	s := newTestUUIDStore()
	if err := s.Set("explicit-id-42"); err != nil {
		t.Fatalf("Set: %v", err)
	}
	got, err := s.Get()
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got != "explicit-id-42" {
		t.Errorf("Get = %q, want %q", got, "explicit-id-42")
	}
}

func TestUUIDStoreUsesUUIDServiceSuffix(t *testing.T) {
	s := newTestUUIDStore()
	s.Set("test-id")
	be := s.Keychain.Backend.(*memBackend)
	if _, ok := be.store["vip-next-cli-uuid|vip-next-cli-uuid"]; !ok {
		t.Errorf("expected key vip-next-cli-uuid|vip-next-cli-uuid in store; got %v", be.store)
	}
}

func TestUUIDStoreReturnsErrOnBackendError(t *testing.T) {
	be := &errBackend{}
	s := &UUIDStore{Keychain: &keychain.Keychain{Backend: be, Service: "vip-next-cli"}}
	_, err := s.Get()
	if err == nil {
		t.Error("expected error when backend fails")
	}
	if errors.Is(err, keychain.ErrNotFound) {
		t.Error("non-NotFound errors must surface as-is")
	}
}

type errBackend struct{}

func (errBackend) Set(string, string, string) error   { return errors.New("boom") }
func (errBackend) Get(string, string) (string, error) { return "", errors.New("boom") }
func (errBackend) Delete(string, string) error        { return errors.New("boom") }

package keychain

import (
	"errors"
	"os"
	"testing"
)

type memBackend struct {
	store map[string]string
}

func (m *memBackend) Set(service, user, secret string) error {
	if m.store == nil {
		m.store = map[string]string{}
	}
	m.store[service+"|"+user] = secret
	return nil
}
func (m *memBackend) Get(service, user string) (string, error) {
	v, ok := m.store[service+"|"+user]
	if !ok {
		return "", ErrNotFound
	}
	return v, nil
}
func (m *memBackend) Delete(service, user string) error {
	delete(m.store, service+"|"+user)
	return nil
}

func TestRoundTrip(t *testing.T) {
	k := &Keychain{Backend: &memBackend{}, Service: "vip-go-cli-test"}

	if err := k.Set("rinat", "secret-value"); err != nil {
		t.Fatalf("Set: %v", err)
	}
	got, err := k.Get("rinat")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got != "secret-value" {
		t.Errorf("Get = %q, want %q", got, "secret-value")
	}
}

func TestGetMissingReturnsNotFound(t *testing.T) {
	k := &Keychain{Backend: &memBackend{}, Service: "vip-go-cli-test"}
	_, err := k.Get("absent")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestServiceNamesAreHostSpecific(t *testing.T) {
	if got := ServiceNameForHost("https://api.wpvip.com"); got != "vip-next-cli" {
		t.Errorf("ServiceNameForHost prod = %q, want %q", got, "vip-next-cli")
	}
	if got := ServiceNameForHost("https://staging-api.wpvip.com:8443"); got != "vip-next-cli:https---staging-api-wpvip-com-8443" {
		t.Errorf("ServiceNameForHost staging = %q, want %q", got, "vip-next-cli:https---staging-api-wpvip-com-8443")
	}
	if got := LegacyServiceNameForHost("https://api.wpvip.com"); got != "vip-go-cli" {
		t.Errorf("LegacyServiceNameForHost prod = %q, want %q", got, "vip-go-cli")
	}
	if got := LegacyServiceNameForHost("https://staging-api.wpvip.com:8443"); got != "vip-go-cli:https---staging-api-wpvip-com-8443" {
		t.Errorf("LegacyServiceNameForHost staging = %q, want %q", got, "vip-go-cli:https---staging-api-wpvip-com-8443")
	}
}

func TestFileBackendRoundTrip(t *testing.T) {
	dir := t.TempDir()
	b := &FileBackend{Dir: dir}

	if err := b.Set("svc", "user", "secret"); err != nil {
		t.Fatalf("Set: %v", err)
	}
	got, err := b.Get("svc", "user")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got != "secret" {
		t.Errorf("Get = %q, want %q", got, "secret")
	}
	if err := b.Delete("svc", "user"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := b.Get("svc", "user"); !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestAccountEqualsService(t *testing.T) {
	k := &Keychain{Service: "vip-next-cli"}
	if k.Account() != "vip-next-cli" {
		t.Errorf("Account() = %q, want %q", k.Account(), "vip-next-cli")
	}
}

func TestFileBackendCreatesFileMode0600(t *testing.T) {
	dir := t.TempDir()
	b := &FileBackend{Dir: dir}
	if err := b.Set("svc", "user", "secret"); err != nil {
		t.Fatalf("Set: %v", err)
	}
	info, err := os.Stat(b.path())
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("file mode = %o, want 0600", info.Mode().Perm())
	}
}

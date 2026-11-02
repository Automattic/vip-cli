package telemetry

import (
	"sync"
	"testing"

	"github.com/Automattic/vip/internal/keychain"
)

type fakeClient struct {
	mu     sync.Mutex
	events []string
	props  []map[string]any
}

func (f *fakeClient) TrackEvent(name string, props map[string]any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, name)
	f.props = append(f.props, props)
	return nil
}

func TestTrackerFanOut(t *testing.T) {
	a, b := &fakeClient{}, &fakeClient{}
	tr := &Tracker{Clients: []Client{a, b}}
	tr.TrackEvent("foo", map[string]any{"x": 1})
	if len(a.events) != 1 || len(b.events) != 1 {
		t.Errorf("expected fan-out; a=%d b=%d", len(a.events), len(b.events))
	}
}

func TestTrackerDoNotTrackDisables(t *testing.T) {
	c := &fakeClient{}
	tr := &Tracker{Clients: []Client{c}, Disabled: true}
	tr.TrackEvent("foo", nil)
	if len(c.events) != 0 {
		t.Error("expected no events when Disabled")
	}
}

type countingUUIDBackend struct {
	gets int
	sets int
}

func (b *countingUUIDBackend) Get(string, string) (string, error) {
	b.gets++
	return "anonymous-id", nil
}

func (b *countingUUIDBackend) Set(string, string, string) error {
	b.sets++
	return nil
}

func (b *countingUUIDBackend) Delete(string, string) error { return nil }

func TestNonemptyDoNotTrackSkipsUUIDAndClients(t *testing.T) {
	for _, value := range []string{"1", "0", "false", " "} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("GO_ENV", "")
			t.Setenv("NODE_ENV", "")
			t.Setenv("DO_NOT_TRACK", value)

			defaultTracker := NewDefault()
			if defaultTracker == nil || !defaultTracker.Disabled || defaultTracker.UUIDStore != nil || len(defaultTracker.Clients) != 0 {
				t.Fatalf("NewDefault initialized telemetry under DO_NOT_TRACK=%q: %+v", value, defaultTracker)
			}

			backend := &countingUUIDBackend{}
			client := &fakeClient{}
			tr := &Tracker{
				Clients:   []Client{client},
				UUIDStore: &UUIDStore{Keychain: &keychain.Keychain{Backend: backend, Service: "vip-next-cli"}},
			}
			tr.TrackEvent("test", nil)
			tr.AliasUser(99)
			if backend.gets != 0 || backend.sets != 0 || len(client.events) != 0 {
				t.Fatalf("opt-out accessed UUID store or client: gets=%d sets=%d events=%v", backend.gets, backend.sets, client.events)
			}
		})
	}
}

func TestMakeCommandTracker(t *testing.T) {
	c := &fakeClient{}
	tr := &Tracker{Clients: []Client{c}}
	ct := tr.MakeCommandTracker("whoami", map[string]any{"command": "vip whoami"})
	ct("execute", nil)
	ct("success", map[string]any{"duration_ms": 42})
	if len(c.events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(c.events))
	}
	if c.events[0] != "whoami_command_execute" || c.events[1] != "whoami_command_success" {
		t.Errorf("event names = %v", c.events)
	}
	if c.props[1]["command"] != "vip whoami" || c.props[1]["duration_ms"] != 42 {
		t.Errorf("merged props = %v", c.props[1])
	}
}

func TestAliasUserEmitsAliasEvent(t *testing.T) {
	c := &fakeClient{}
	store := newTestUUIDStore()
	store.Set("anon-id")
	tr := &Tracker{Clients: []Client{c}, UUIDStore: store}
	tr.AliasUser(99)
	if len(c.events) != 1 || c.events[0] != "_alias_user" {
		t.Errorf("expected _alias_user event, got %v", c.events)
	}
	if c.props[0]["_ui"] != int64(99) {
		t.Errorf("_ui = %v, want 99", c.props[0]["_ui"])
	}
	if c.props[0]["anonid"] != "anon-id" {
		t.Errorf("anonid = %v, want anon-id", c.props[0]["anonid"])
	}
	got, _ := store.Get()
	if got != "99" {
		t.Errorf("UUID after alias = %q, want %q", got, "99")
	}
}

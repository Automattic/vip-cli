package telemetry

import (
	"sync"
	"testing"
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

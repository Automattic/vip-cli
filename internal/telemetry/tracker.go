package telemetry

import (
	"fmt"
	"os"
)

// Client is the common interface satisfied by TracksClient and PendoClient.
type Client interface {
	TrackEvent(name string, props map[string]any) error
}

// Tracker fans out analytics events to all configured Clients.
// Set Disabled to suppress all events without removing the clients.
// isDoNotTrack() also suppresses events when the environment signals opt-out.
type Tracker struct {
	Clients   []Client
	UUIDStore *UUIDStore
	Disabled  bool
}

// TrackEvent emits name with props to every configured Client.
// It is a no-op when the tracker is disabled or DO_NOT_TRACK / test env vars are set.
func (t *Tracker) TrackEvent(name string, props map[string]any) {
	if t.Disabled || isDoNotTrack() {
		return
	}
	for _, c := range t.Clients {
		_ = c.TrackEvent(name, props)
	}
}

// AliasUser emits a special "_alias_user" event that links the anonymous UUID
// to the authenticated VIP user ID, then updates the UUID store so subsequent
// events carry the user's real identity — mirroring aliasUser() in tracker.ts.
func (t *Tracker) AliasUser(vipUserID int64) {
	if vipUserID == 0 || t.Disabled || isDoNotTrack() {
		return
	}
	prevID := ""
	if t.UUIDStore != nil {
		prevID, _ = t.UUIDStore.Get()
	}
	t.TrackEvent("_alias_user", map[string]any{
		"_ui":    vipUserID,
		"_ut":    TracksUserType,
		"anonid": prevID,
	})
	if t.UUIDStore != nil {
		_ = t.UUIDStore.Set(fmt.Sprintf("%d", vipUserID))
	}
}

// MakeCommandTracker returns a closure that emits "<command>_command_<eventType>"
// events, merging baseInfo with any per-call data — mirroring makeCommandTracker()
// in tracker.ts.
func (t *Tracker) MakeCommandTracker(command string, info map[string]any) func(string, map[string]any) {
	return func(eventType string, data map[string]any) {
		merged := make(map[string]any, len(info)+len(data))
		for k, v := range info {
			merged[k] = v
		}
		for k, v := range data {
			merged[k] = v
		}
		t.TrackEvent(fmt.Sprintf("%s_command_%s", command, eventType), merged)
	}
}

// isDoNotTrack returns true when any of the standard opt-out environment
// variables are set, matching the Node binary's behaviour.
func isDoNotTrack() bool {
	return os.Getenv("DO_NOT_TRACK") != "" ||
		os.Getenv("GO_ENV") == "test" ||
		os.Getenv("NODE_ENV") == "test"
}

package update

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDueAndStateIsolation(t *testing.T) {
	now := time.Date(2026, 9, 8, 12, 0, 0, 0, time.UTC)
	c := Cache{Schema: 1, Platform: Platform{"linux", "amd64"}, Channel: Preview, LastCheckedAt: now.Add(-23 * time.Hour)}
	if Due(c, now) {
		t.Fatal("fresh")
	}
	c.LastCheckedAt = now.Add(-25 * time.Hour)
	if !Due(c, now) {
		t.Fatal("expired")
	}
	c.LastFailedAt = now.Add(-30 * time.Minute)
	if Due(c, now) {
		t.Fatal("backoff")
	}
	c.LastFailedAt = now.Add(-time.Hour)
	if !Due(c, now) {
		t.Fatal("backoff expired")
	}
	c.LastCheckedAt = now.Add(time.Hour)
	if !Due(c, now) {
		t.Fatal("future")
	}
	s := State{CacheDir: t.TempDir(), ConfigDir: t.TempDir()}
	c.LastCheckedAt = now
	c.Releases = []Release{release("5.0.1")}
	if err := s.WriteCache(c); err != nil {
		t.Fatal(err)
	}
	got, err := s.ReadCache(Preview, c.Platform)
	if err != nil || len(got.Releases) != 1 {
		t.Fatal(got, err)
	}
	if _, err = s.ReadCache(Stable, c.Platform); err == nil {
		t.Fatal("cross channel cache")
	}
	if err = s.WriteChannel(Preview); err != nil {
		t.Fatal(err)
	}
	ch, err := s.ReadChannel()
	if err != nil || ch != Preview {
		t.Fatal(ch, err)
	}
	if err = os.WriteFile(filepath.Join(s.ConfigDir, "update.json"), []byte(`{"Channel":"bogus"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = s.ReadChannel(); err == nil {
		t.Fatal("invalid preference accepted")
	}
}
func TestNotifierDoesNotWaitAndReevaluatesCache(t *testing.T) {
	entered, canceled := make(chan struct{}), make(chan struct{})
	s := State{CacheDir: t.TempDir(), ConfigDir: t.TempDir()}
	n := Notifier{State: s, Installed: "5.0.0", Platform: Platform{"linux", "amd64"}, Now: time.Now, Fetch: func(ctx context.Context) ([]Release, error) {
		close(entered)
		<-ctx.Done()
		close(canceled)
		return nil, ctx.Err()
	}}
	finish := n.Start(context.Background())
	<-entered
	done := make(chan struct{})
	go func() { finish(); finish(); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("blocked")
	}
	<-canceled
	if err := s.WriteCache(Cache{Schema: 1, Platform: n.Platform, Channel: Stable, LastCheckedAt: time.Now(), Releases: []Release{release("5.0.1")}}); err != nil {
		t.Fatal(err)
	}
	notice := n.Start(context.Background())()
	if notice == nil || notice.Version != "5.0.1" {
		t.Fatal(notice)
	}
	n.Installed = "5.0.1"
	if notice = n.Start(context.Background())(); notice != nil {
		t.Fatal("stale notice", notice)
	}
}

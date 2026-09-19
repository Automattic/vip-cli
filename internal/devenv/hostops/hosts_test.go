package hostops

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnsureHostsAddsBlockIdempotently(t *testing.T) {
	p := filepath.Join(t.TempDir(), "hosts")
	if err := os.WriteFile(p, []byte("127.0.0.1 localhost\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	hosts := []string{"example.test", "foo.example.test"}
	if err := EnsureHosts(p, hosts); err != nil {
		t.Fatal(err)
	}
	// second call must not duplicate the block
	if err := EnsureHosts(p, hosts); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(p)
	got := string(b)
	if c := strings.Count(got, beginMarker); c != 1 {
		t.Fatalf("block written %d times, want 1:\n%s", c, got)
	}
	for _, h := range hosts {
		if !strings.Contains(got, "127.0.0.1 "+h) {
			t.Fatalf("missing entry for %s:\n%s", h, got)
		}
	}
	if !strings.Contains(got, "127.0.0.1 localhost") {
		t.Fatalf("clobbered existing content:\n%s", got)
	}
}

func TestEnsureHostsUpdatesBlock(t *testing.T) {
	p := filepath.Join(t.TempDir(), "hosts")
	if err := os.WriteFile(p, []byte("127.0.0.1 localhost\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := EnsureHosts(p, []string{"old.test"}); err != nil {
		t.Fatal(err)
	}
	if err := EnsureHosts(p, []string{"new.test"}); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(p)
	got := string(b)
	if strings.Contains(got, "old.test") {
		t.Fatalf("stale entry not replaced:\n%s", got)
	}
	if !strings.Contains(got, "new.test") {
		t.Fatalf("new entry missing:\n%s", got)
	}
}

func TestRemoveHostsStripsBlock(t *testing.T) {
	p := filepath.Join(t.TempDir(), "hosts")
	if err := os.WriteFile(p, []byte("127.0.0.1 localhost\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := EnsureHosts(p, []string{"x.test"}); err != nil {
		t.Fatal(err)
	}
	if err := RemoveHosts(p); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(p)
	got := string(b)
	if strings.Contains(got, beginMarker) || strings.Contains(got, "x.test") {
		t.Fatalf("block not removed:\n%s", got)
	}
	if !strings.Contains(got, "127.0.0.1 localhost") {
		t.Fatalf("clobbered existing content:\n%s", got)
	}
}

func TestEnsureHostsEmptyFileNoLeadingNewline(t *testing.T) {
	p := filepath.Join(t.TempDir(), "hosts")
	if err := os.WriteFile(p, []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := EnsureHosts(p, []string{"a.test"}); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(p)
	if strings.HasPrefix(string(b), "\n") {
		t.Fatalf("output must not start with a blank line:\n%q", string(b))
	}
	if !strings.HasPrefix(string(b), beginMarker) {
		t.Fatalf("expected block at start of empty file:\n%q", string(b))
	}
}

func TestEnsureHostsEmptySliceRemovesBlock(t *testing.T) {
	p := filepath.Join(t.TempDir(), "hosts")
	if err := os.WriteFile(p, []byte("127.0.0.1 localhost\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := EnsureHosts(p, []string{"x.test"}); err != nil {
		t.Fatal(err)
	}
	if err := EnsureHosts(p, nil); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(p)
	got := string(b)
	if strings.Contains(got, beginMarker) || strings.Contains(got, "x.test") {
		t.Fatalf("empty slice should remove the block:\n%s", got)
	}
	if !strings.Contains(got, "127.0.0.1 localhost") {
		t.Fatalf("clobbered existing content:\n%s", got)
	}
}

func TestEnsureHostsRejectsBadHostname(t *testing.T) {
	p := filepath.Join(t.TempDir(), "hosts")
	if err := os.WriteFile(p, []byte("127.0.0.1 localhost\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := EnsureHosts(p, []string{"evil host\n1.2.3.4 attacker"}); err == nil {
		t.Fatal("expected error for hostname with embedded whitespace/newline")
	}
}

func TestStripBlockUnclosedErrors(t *testing.T) {
	_, err := stripBlock("127.0.0.1 localhost\n" + beginMarker + "\n127.0.0.1 a.test\n")
	if err == nil {
		t.Fatal("expected error for begin marker without matching end marker")
	}
}

func TestRenderHostsBlockPreview(t *testing.T) {
	got := RenderHostsBlock([]string{"a.test", "b.test"})
	if !strings.Contains(got, beginMarker) || !strings.Contains(got, endMarker) {
		t.Fatalf("preview missing markers:\n%s", got)
	}
	for _, h := range []string{"127.0.0.1 a.test", "127.0.0.1 b.test"} {
		if !strings.Contains(got, h) {
			t.Fatalf("preview missing %q:\n%s", h, got)
		}
	}
}

func TestHostsPresentIn(t *testing.T) {
	content := "127.0.0.1 localhost\n" + beginMarker + "\n127.0.0.1 a.test\n127.0.0.1 b.test\n" + endMarker + "\n"
	if !hostsPresentIn(content, []string{"a.test", "b.test"}) {
		t.Fatal("both managed hosts should be present")
	}
	if hostsPresentIn(content, []string{"a.test", "c.test"}) {
		t.Fatal("c.test is not in the managed block")
	}
	// A host outside the managed block does not count.
	if hostsPresentIn("127.0.0.1 outside.test\n", []string{"outside.test"}) {
		t.Fatal("hosts outside the managed block must not count as present")
	}
}

func TestManagedHostsMatchInRequiresExactSnapshot(t *testing.T) {
	content := "127.0.0.1 localhost\n" + RenderHostsBlock([]string{"a.test", "b.test"})
	if !managedHostsMatchIn(content, []string{"b.test", "a.test"}) {
		t.Fatal("same managed hosts in a different order should match")
	}
	if managedHostsMatchIn(content, []string{"a.test"}) {
		t.Fatal("an extra managed hostname must make the snapshot differ")
	}
	if managedHostsMatchIn(content, []string{"a.test", "b.test", "c.test"}) {
		t.Fatal("a missing managed hostname must make the snapshot differ")
	}
	if managedHostsMatchIn("# BEGIN vip-dev-env\n127.0.0.1 a.test\n", []string{"a.test"}) {
		t.Fatal("a malformed managed block must not match")
	}
	if hostsPresentIn("# BEGIN vip-dev-env\n\n# END vip-dev-env\n", []string{"a.test"}) {
		t.Fatal("a blank line in the managed block must not invent a hostname")
	}
}

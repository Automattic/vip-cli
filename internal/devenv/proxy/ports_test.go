package proxy

import (
	"path/filepath"
	"testing"
)

func TestSelectPortPrefersFirstFree(t *testing.T) {
	free := func(p int) bool { return p != 80 } // 80 busy, 8000 free
	got, err := SelectPort(80, []int{8000, 8080}, free)
	if err != nil {
		t.Fatal(err)
	}
	if got != 8000 {
		t.Fatalf("got %d, want 8000 (80 busy)", got)
	}
}

func TestSelectPortPreferredWhenFree(t *testing.T) {
	got, err := SelectPort(443, []int{444}, func(int) bool { return true })
	if err != nil {
		t.Fatal(err)
	}
	if got != 443 {
		t.Fatalf("got %d, want 443", got)
	}
}

func TestSelectPortAllBusy(t *testing.T) {
	_, err := SelectPort(80, []int{8000}, func(int) bool { return false })
	if err == nil {
		t.Fatal("expected error when all candidates busy")
	}
}

func TestPortsPersistRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy-ports.json")
	if err := SavePorts(path, Ports{HTTP: 8080, HTTPS: 4433}); err != nil {
		t.Fatal(err)
	}
	got, err := LoadPorts(path)
	if err != nil {
		t.Fatal(err)
	}
	if got.HTTP != 8080 || got.HTTPS != 4433 {
		t.Fatalf("round-trip mismatch: %+v", got)
	}
}

func TestLoadPortsMissingReturnsZero(t *testing.T) {
	got, err := LoadPorts(filepath.Join(t.TempDir(), "nope.json"))
	if err != nil {
		t.Fatalf("missing file should not error: %v", err)
	}
	if got.HTTP != 0 || got.HTTPS != 0 {
		t.Fatalf("missing file should yield zero Ports, got %+v", got)
	}
}

func TestSelectPortNoFallbacksAllBusy(t *testing.T) {
	if _, err := SelectPort(80, nil, func(int) bool { return false }); err == nil {
		t.Fatal("expected error with no fallbacks and preferred busy")
	}
}

func TestListenProbeOptimisticForPrivilegedPorts(t *testing.T) {
	// Ports <1024 are reported free (let Docker + retry decide), regardless of
	// whether this non-root test process could bind them.
	if !ListenProbe(80) {
		t.Fatal("ListenProbe(80) should be optimistic (privileged port)")
	}
	if !ListenProbe(443) {
		t.Fatal("ListenProbe(443) should be optimistic (privileged port)")
	}
}

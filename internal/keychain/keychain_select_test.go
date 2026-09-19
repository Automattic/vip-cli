package keychain

import "testing"

func TestChooseBackend(t *testing.T) {
	up := func() bool { return true }
	down := func() bool { return false }

	// Headless Linux (Secret Service unreachable) -> file fallback.
	if _, ok := chooseBackend("linux", down, "/tmp/vip").(*FileBackend); !ok {
		t.Fatalf("linux without a reachable keyring must use the file fallback")
	}
	// Linux with a working Secret Service -> OS keyring.
	if _, ok := chooseBackend("linux", up, "/tmp/vip").(defaultBackend); !ok {
		t.Fatalf("linux with a reachable keyring must use the OS keyring")
	}
	// macOS / Windows always have a credential store; the probe must be skipped.
	for _, goos := range []string{"darwin", "windows"} {
		probed := false
		probe := func() bool { probed = true; return false }
		if _, ok := chooseBackend(goos, probe, "/tmp/vip").(defaultBackend); !ok {
			t.Fatalf("%s must use the OS keyring", goos)
		}
		if probed {
			t.Fatalf("%s must not probe the Secret Service", goos)
		}
	}
}

func TestFallbackDir(t *testing.T) {
	if d := fallbackDir(); d == "" {
		t.Fatal("fallbackDir must return a non-empty path")
	}
}

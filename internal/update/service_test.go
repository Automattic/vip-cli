package update

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"
)

func TestServiceCheckAndChannelPersistence(t *testing.T) {
	s := Service{Installed: "5.0.0-rc.2", Platform: Platform{"linux", "amd64"}, State: State{CacheDir: t.TempDir(), ConfigDir: t.TempDir()}, Now: time.Now, Fetch: func(context.Context) ([]Release, error) { return []Release{release("5.0.0")}, nil }, Executable: func() (string, error) { t.Fatal("check inspected installation"); return "", nil }}
	out, err := s.Run(context.Background(), Request{CheckOnly: true, Channel: Stable, ExplicitChannel: true}, nil)
	if err != nil || out.Available != "5.0.0" || out.Updated {
		t.Fatal(out, err)
	}
	ch, err := s.State.ReadChannel()
	if err != nil || ch != Stable {
		t.Fatal(ch, err)
	}
	s.Fetch = func(context.Context) ([]Release, error) { return nil, errors.New("offline") }
	if _, err = s.Run(context.Background(), Request{CheckOnly: true, Channel: Preview, ExplicitChannel: true}, nil); err == nil {
		t.Fatal("missing failure")
	}
	ch, _ = s.State.ReadChannel()
	if ch != Stable {
		t.Fatal("failed check changed channel")
	}
}
func TestServiceStableAheadAndManagedInstall(t *testing.T) {
	s := Service{Installed: "5.1.0-beta.1", Platform: Platform{"linux", "amd64"}, State: State{CacheDir: t.TempDir(), ConfigDir: t.TempDir()}, Now: time.Now, Fetch: func(context.Context) ([]Release, error) { return []Release{release("5.0.0")}, nil }}
	out, err := s.Run(context.Background(), Request{Channel: Stable, ExplicitChannel: true}, nil)
	if err != nil || out.Updated || out.Available != "" {
		t.Fatal(out, err)
	}
	l, _ := installFixture(t)
	s.Installed = "5.0.0"
	s.Executable = func() (string, error) { return l.CLI, nil }
	s.Fetch = func(context.Context) ([]Release, error) { return []Release{release("5.0.1")}, nil }
	s.Installer.InspectOwnership = func(context.Context, Layout) (Ownership, error) { return Ownership{true, "use manager"}, nil }
	s.Stage = func(context.Context, Candidate, Platform, string) (Bundle, error) {
		t.Fatal("managed installation staged")
		return Bundle{}, nil
	}
	out, err = s.Run(context.Background(), Request{}, nil)
	if err != nil || out.Instructions != "use manager" {
		t.Fatal(out, err)
	}
}

func TestServiceRejectsInstallationChangedDuringDiscovery(t *testing.T) {
	l, b := installFixture(t)
	s := Service{Installed: "5.0.0", Platform: Platform{"linux", "amd64"}, State: State{CacheDir: t.TempDir(), ConfigDir: t.TempDir()}, Executable: func() (string, error) { return l.CLI, nil }, Fetch: func(context.Context) ([]Release, error) {
		if err := os.Rename(b.CLI, l.CLI); err != nil {
			t.Fatal(err)
		}
		return []Release{release("5.0.1")}, nil
	}, Stage: func(context.Context, Candidate, Platform, string) (Bundle, error) {
		t.Fatal("stale process attempted installation")
		return Bundle{}, nil
	}, Installer: Installer{InspectOwnership: func(context.Context, Layout) (Ownership, error) { return Ownership{}, nil }}}
	if _, err := s.Run(context.Background(), Request{}, nil); err == nil {
		t.Fatal("changed executable accepted")
	}
}

func TestServiceReportsBothDirectoryFailures(t *testing.T) {
	// Restore all environment changes after this test; no filesystem or network
	// operations should run when the standard user directories are unavailable.
	for _, name := range []string{"HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "LocalAppData", "AppData"} {
		t.Setenv(name, "")
	}
	s := NewService()
	_, err := s.Run(context.Background(), Request{CheckOnly: true}, nil)
	if err == nil || !strings.Contains(err.Error(), "update cache directory:") || !strings.Contains(err.Error(), "update config directory:") {
		t.Fatalf("missing directory failure details: %v", err)
	}
}

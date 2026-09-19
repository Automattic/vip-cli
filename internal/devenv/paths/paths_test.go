package paths

import (
	"path/filepath"
	"testing"
)

func TestXDGDataHonorsEnv(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/tmp/xdgcustom")
	if got := XDGData(); got != "/tmp/xdgcustom" {
		t.Fatalf("XDGData() = %q, want /tmp/xdgcustom", got)
	}
}

func TestXDGDataFallsBackToHome(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "")
	home := t.TempDir()
	t.Setenv("HOME", home)
	want := filepath.Join(home, ".local", "share")
	if got := XDGData(); got != want {
		t.Fatalf("XDGData() = %q, want %q", got, want)
	}
}

func TestEnvironmentPath(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/data")
	want := filepath.Join("/data", "vip", "dev-environment", "myslug")
	if got := EnvironmentPath("myslug"); got != want {
		t.Fatalf("EnvironmentPath = %q, want %q", got, want)
	}
}

func TestEnvLogDir(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/data")
	want := filepath.Join("/data", "vip", "dev-environment", "myslug", "logs")
	if got := EnvLogDir("myslug"); got != want {
		t.Fatalf("EnvLogDir = %q, want %q", got, want)
	}
}

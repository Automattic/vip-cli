package mediaimport

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsLocalArchive(t *testing.T) {
	dir := t.TempDir()
	mk := func(name string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
		return p
	}
	targz := mk("a.tar.gz")
	tgz := mk("b.TGZ") // case-insensitive (utils.ts:4 toLowerCase)
	zip := mk("c.zip")
	sql := mk("d.sql")

	for p, want := range map[string]bool{
		targz: true, tgz: true, zip: true, sql: false,
		filepath.Join(dir, "missing.zip"): false, // stat fails -> false
	} {
		if got := IsLocalArchive(p); got != want {
			t.Errorf("IsLocalArchive(%q) = %v, want %v", p, got, want)
		}
	}
	// directory with archive extension -> false (stat.isFile, utils.ts:13)
	archiveDir := filepath.Join(dir, "fake.zip")
	if err := os.MkdirAll(archiveDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if IsLocalArchive(archiveDir) {
		t.Error("directory must not count as a local archive")
	}
}

func TestIsSupportedApp(t *testing.T) {
	// SUPPORTED_MEDIA_FILE_IMPORT_SITE_TYPES = ['WordPress'] (media-file-import.ts:16)
	if !IsSupportedApp("WordPress") || IsSupportedApp("node") || IsSupportedApp("") {
		t.Error("IsSupportedApp must accept exactly 'WordPress'")
	}
}

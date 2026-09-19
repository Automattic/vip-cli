package update

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestOwnershipUsesReceiptsAndFailsClosed(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "Cellar", "vip-next", "5.0.0")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	l := Layout{filepath.Join(dir, "bin", "vip-next"), filepath.Join(dir, "bin", "go-search-replace")}
	q := func(context.Context, string, ...string) ([]byte, error) { t.Fatal("unexpected query"); return nil, nil }
	o, err := inspectOwnership(context.Background(), l, "darwin", q)
	if err != nil || !o.Managed {
		t.Fatal(o, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "INSTALL_RECEIPT.json"), []byte(`{"installed_on_request":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	o, err = inspectOwnership(context.Background(), l, "darwin", q)
	if err != nil || o.Instructions != "This installation is managed by Homebrew. Run: brew upgrade vip-next" {
		t.Fatal(o, err)
	}
	_, err = inspectOwnership(context.Background(), Layout{"/usr/bin/vip-next", "/usr/bin/go-search-replace"}, "linux", func(context.Context, string, ...string) ([]byte, error) {
		return nil, errors.New("database unavailable")
	})
	if err == nil {
		t.Fatal("database failure treated as unowned")
	}
	o, err = inspectOwnership(context.Background(), Layout{"/usr/local/bin/vip-next", "/usr/local/bin/go-search-replace"}, "darwin", q)
	if err != nil || o.Managed {
		t.Fatal("bare /usr/local/bin misclassified", o, err)
	}
}
func TestResolveLayoutPreservesEntrypointSymlink(t *testing.T) {
	l, _ := installFixture(t)
	link := filepath.Join(t.TempDir(), "vip")
	if err := os.Symlink(l.CLI, link); err != nil {
		t.Skipf("symlink creation unavailable: %v", err)
	}
	got, err := ResolveLayout(link, Platform{"linux", "amd64"})
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.EvalSymlinks(l.CLI)
	if got.CLI != want {
		t.Fatal(got, want)
	}
	if _, err := os.Readlink(link); err != nil {
		t.Fatal("entry symlink changed", err)
	}
}

package update

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func installFixture(t *testing.T) (Layout, Bundle) {
	t.Helper()
	root, stage := t.TempDir(), t.TempDir()
	l := Layout{filepath.Join(root, "vip-next"), filepath.Join(root, "go-search-replace")}
	b := Bundle{stage, filepath.Join(stage, "vip-next"), filepath.Join(stage, "go-search-replace")}
	for p, s := range map[string]string{l.CLI: "old-cli", l.Helper: "old-helper", b.CLI: "new-cli", b.Helper: "new-helper"} {
		if err := os.WriteFile(p, []byte(s), 0755); err != nil {
			t.Fatal(err)
		}
	}
	return l, b
}
func TestApplyRecovery(t *testing.T) {
	for _, failAt := range []int{0, 1, 2, 3, 4} {
		t.Run(string(rune('0'+failAt)), func(t *testing.T) {
			l, b := installFixture(t)
			calls := 0
			i := Installer{Rename: func(a, z string) error {
				calls++
				if calls == failAt {
					return errors.New("injected rename")
				}
				return os.Rename(a, z)
			}, InspectOwnership: func(context.Context, Layout) (Ownership, error) { return Ownership{}, nil }}
			var done int
			_, err := i.Apply(context.Background(), l, b, func(s Step) {
				if s.Done {
					done++
				}
			})
			if failAt == 0 {
				if err != nil || done != 2 {
					t.Fatal(err, done)
				}
			} else if err == nil {
				t.Fatal("missing error")
			}
			wantCLI, wantHelper := "old-cli", "old-helper"
			if failAt == 0 {
				wantCLI, wantHelper = "new-cli", "new-helper"
			}
			for p, want := range map[string]string{l.CLI: wantCLI, l.Helper: wantHelper} {
				got, err := os.ReadFile(p)
				if err != nil || string(got) != want {
					t.Fatal(p, string(got), err)
				}
			}
		})
	}
}
func TestApplyRollbackFailurePreservesRecovery(t *testing.T) {
	l, b := installFixture(t)
	calls := 0
	i := Installer{Rename: func(a, z string) error {
		calls++
		if calls >= 4 {
			return errors.New("locked")
		}
		return os.Rename(a, z)
	}, InspectOwnership: func(context.Context, Layout) (Ownership, error) { return Ownership{}, nil }}
	_, err := i.Apply(context.Background(), l, b, func(Step) {})
	if err == nil {
		t.Fatal("expected failure")
	}
	if _, err = os.Stat(markerPath(l)); err != nil {
		t.Fatal("recovery marker lost", err)
	}
	if _, err = (Installer{}).Apply(context.Background(), l, b, func(Step) {}); err == nil {
		t.Fatal("incomplete update silently resumed")
	}
}
func TestLayoutAndLock(t *testing.T) {
	root := t.TempDir()
	root, _ = filepath.EvalSymlinks(root)
	cli := filepath.Join(root, "vip-next")
	for _, p := range []string{cli, filepath.Join(root, "go-search-replace")} {
		if err := os.WriteFile(p, []byte("old"), 0755); err != nil {
			t.Fatal(err)
		}
	}
	l, err := ResolveLayout(cli, Platform{"linux", "amd64"})
	if err != nil || l.Helper != filepath.Join(root, "go-search-replace") {
		t.Fatal(l, err)
	}
	if err = os.Mkdir(filepath.Join(root, "bin"), 0755); err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(root, "bin", "go-search-replace")
	if err = os.WriteFile(nested, []byte("nested"), 0755); err != nil {
		t.Fatal(err)
	}
	l, err = ResolveLayout(cli, Platform{"linux", "amd64"})
	if err != nil || l.Helper != nested {
		t.Fatal(l, err)
	}
	unlock, err := AcquireLock(cli)
	if err != nil {
		t.Fatal(err)
	}
	if release, err := AcquireLock(cli); err == nil {
		release()
		t.Fatal("concurrent lock")
	}
	if err = unlock(); err != nil {
		t.Fatal(err)
	}
	unlock, err = AcquireLock(cli)
	if err != nil {
		t.Fatal(err)
	}
	unlock()
}

func TestApplyPreflightFailureCleansStagedCopies(t *testing.T) {
	l, b := installFixture(t)
	if err := os.Remove(l.Helper); err != nil {
		t.Fatal(err)
	}
	_, err := (Installer{InspectOwnership: func(context.Context, Layout) (Ownership, error) { return Ownership{}, nil }}).Apply(context.Background(), l, b, nil)
	if err == nil {
		t.Fatal("missing helper accepted")
	}
	paths, err := filepath.Glob(filepath.Join(filepath.Dir(l.CLI), ".*.vip-update-*-new"))
	if err != nil || len(paths) != 0 {
		t.Fatal("preflight leaked staging", paths, err)
	}
}

func TestManagedBundleNeverChangesFiles(t *testing.T) {
	l, b := installFixture(t)
	_, err := (Installer{InspectOwnership: func(context.Context, Layout) (Ownership, error) { return Ownership{true, "use package manager"}, nil }}).Apply(context.Background(), l, b, nil)
	if err == nil {
		t.Fatal("managed files accepted")
	}
	for path, want := range map[string]string{l.CLI: "old-cli", l.Helper: "old-helper"} {
		got, e := os.ReadFile(path)
		if e != nil || string(got) != want {
			t.Fatal(path, e)
		}
	}
}

package validatefiles

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mkTree(t *testing.T, root string, files []string) {
	t.Helper()
	for _, f := range files {
		p := filepath.Join(root, f)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

func TestFindNestedDirectories(t *testing.T) {
	root := t.TempDir()
	mkTree(t, root, []string{
		"uploads/2020/06/a.jpg",
		"uploads/2020/06/b.png",
		"uploads/2020/06/.DS_Store", // hidden — filtered (ts:276)
		"uploads/2020/07/c.gif",
	})
	res := FindNestedDirectories(filepath.Join(root, "uploads"), &bytes.Buffer{})
	if res == nil {
		t.Fatal("walk failed")
	}
	if len(res.Files) != 3 {
		t.Errorf("files = %v", res.Files)
	}
	if len(res.Folders) != 2 {
		t.Errorf("folders = %v", res.Folders)
	}
	for _, f := range res.Files {
		if strings.Contains(f, ".DS_Store") {
			t.Errorf("hidden file leaked: %s", f)
		}
	}
}

func TestFindNestedDirectoriesUnreadable(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("root ignores permissions")
	}
	root := t.TempDir()
	locked := filepath.Join(root, "locked")
	if err := os.MkdirAll(locked, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(locked, 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(locked, 0o755) })

	var errBuf bytes.Buffer
	res := FindNestedDirectories(locked, &errBuf)
	if res != nil {
		t.Error("unreadable top-level dir must return nil")
	}
	if !strings.Contains(errBuf.String(), "Error: Cannot read nested directory: "+locked) {
		t.Errorf("errW = %q", errBuf.String())
	}
}

func TestFolderStructureValidationSingleSiteGood(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	var buf bytes.Buffer
	bad := FolderStructureValidation([]string{"uploads/2020/06"}, &buf)
	if len(bad) != 0 {
		t.Errorf("bad = %v\n%s", bad, buf.String())
	}
	out := buf.String()
	for _, want := range []string{
		"✅ File structure: Uploads directory exists",
		"✅ File structure: Year directory exists (format: YYYY)",
		"✅ File structure: Month directory exists (format: MM)",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in %q", want, out)
		}
	}
}

func TestFolderStructureValidationSingleSiteBad(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	var buf bytes.Buffer
	bad := FolderStructureValidation([]string{"media/stuff"}, &buf)
	if len(bad) != 1 || bad[0] != "media/stuff" {
		t.Errorf("bad = %v", bad)
	}
	out := buf.String()
	if !strings.Contains(out, "Recommended: Media files should reside in an `uploads` directory") {
		t.Errorf("missing uploads recommendation: %q", out)
	}
	if !strings.Contains(out, "We recommend the WordPress default folder structure") {
		t.Errorf("missing recommended-structure block: %q", out)
	}
}

func TestFolderStructureValidationMultisiteGood(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	var buf bytes.Buffer
	bad := FolderStructureValidation([]string{"uploads/sites/5/2020/06"}, &buf)
	if len(bad) != 0 {
		t.Errorf("bad = %v\n%s", bad, buf.String())
	}
	out := buf.String()
	for _, want := range []string{
		"✅ File structure: Uploads directory exists",
		"✅ File structure: Sites directory exists",
		"✅ File structure: Site ID directory exists",
		"✅ File structure: Year directory exists (format: YYYY)",
		"✅ File structure: Month directory exists (format: MM)",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in %q", want, out)
		}
	}
}

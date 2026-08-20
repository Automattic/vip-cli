package customdeploy

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// buildZip writes a zip with the given entries; names ending in "/" are
// directories; symlinkTargets maps entry name -> target.
func buildZip(t *testing.T, entries []string, symlinks map[string]string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "app.zip")
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for _, name := range entries {
		hdr := &zip.FileHeader{Name: name}
		if strings.HasSuffix(name, "/") {
			hdr.SetMode(os.ModeDir | 0o755)
		} else {
			hdr.SetMode(0o644)
		}
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasSuffix(name, "/") {
			_, _ = w.Write([]byte("x"))
		}
	}
	for name, target := range symlinks {
		hdr := &zip.FileHeader{Name: name}
		hdr.SetMode(os.ModeSymlink | 0o777)
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(target))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return p
}

// buildTarGz writes a .tar.gz with dirs (trailing /), files, and symlinks.
func buildTarGz(t *testing.T, dirs, files []string, symlinks map[string]string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "app.tar.gz")
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	zw := gzip.NewWriter(f)
	tw := tar.NewWriter(zw)
	for _, d := range dirs {
		if err := tw.WriteHeader(&tar.Header{Name: d, Typeflag: tar.TypeDir, Mode: 0o755}); err != nil {
			t.Fatal(err)
		}
	}
	for _, fl := range files {
		if err := tw.WriteHeader(&tar.Header{Name: fl, Typeflag: tar.TypeReg, Mode: 0o644, Size: 1}); err != nil {
			t.Fatal(err)
		}
		_, _ = tw.Write([]byte("x"))
	}
	for name, target := range symlinks {
		if err := tw.WriteHeader(&tar.Header{Name: name, Typeflag: tar.TypeSymlink, Linkname: target, Mode: 0o777}); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestValidateZipFileClean(t *testing.T) {
	p := buildZip(t, []string{
		"app/", "app/themes/", "app/themes/style.css", "app/plugins/", "app/plugins/x.php",
		"__MACOSX/", "__MACOSX/junk!|.txt",
	}, nil)
	if err := ValidateZipFile(p); err != nil {
		t.Errorf("err = %v", err)
	}
}

func TestValidateZipFileTwoRoots(t *testing.T) {
	p := buildZip(t, []string{"a/", "a/themes/", "b/", "b/x.txt"}, nil)
	if err := ValidateZipFile(p); err == nil || err.Error() != errSingleRootDir {
		t.Errorf("err = %v", err)
	}
}

func TestValidateZipFileMissingThemes(t *testing.T) {
	p := buildZip(t, []string{"app/", "app/plugins/"}, nil)
	if err := ValidateZipFile(p); err == nil || err.Error() != errMissingThemes {
		t.Errorf("err = %v", err)
	}
}

func TestValidateZipFileSymlink(t *testing.T) {
	p := buildZip(t, []string{"app/", "app/themes/"},
		map[string]string{"app/evil-link": "/etc/passwd"})
	if err := ValidateZipFile(p); err == nil || !strings.Contains(err.Error(), "Symlink detected: app/evil-link") {
		t.Errorf("err = %v", err)
	}
	// node_modules/.bin symlinks are exempt (validations/custom-deploy.ts:22).
	p = buildZip(t, []string{"app/", "app/themes/"},
		map[string]string{"app/node_modules/pkg/.bin/tool": "../lib/tool.js"})
	if err := ValidateZipFile(p); err != nil {
		t.Errorf("exempt symlink rejected: %v", err)
	}
}

func TestValidateZipFileBadChars(t *testing.T) {
	p := buildZip(t, []string{"app/", "app/themes/", "app/bad?.txt"}, nil)
	if err := ValidateZipFile(p); err == nil || !strings.Contains(err.Error(), "contains disallowed characters") {
		t.Errorf("err = %v", err)
	}
}

func TestValidateTarFileClean(t *testing.T) {
	p := buildTarGz(t,
		[]string{"app/", "app/themes/"},
		[]string{"app/themes/style.css"},
		nil)
	if err := ValidateTarFile(p); err != nil {
		t.Errorf("err = %v", err)
	}
}

func TestValidateTarFileMissingThemes(t *testing.T) {
	p := buildTarGz(t, []string{"app/"}, []string{"app/x.php"}, nil)
	if err := ValidateTarFile(p); err == nil || err.Error() != errMissingThemes {
		t.Errorf("err = %v", err)
	}
}

func TestValidateTarFileTwoRoots(t *testing.T) {
	p := buildTarGz(t, []string{"a/", "a/themes/", "b/"}, nil, nil)
	if err := ValidateTarFile(p); err == nil || err.Error() != errSingleRootDir {
		t.Errorf("err = %v", err)
	}
}

func TestValidateTarFileSymlink(t *testing.T) {
	p := buildTarGz(t, []string{"app/", "app/themes/"}, nil,
		map[string]string{"app/evil": "/etc/passwd"})
	if err := ValidateTarFile(p); err == nil || !strings.Contains(err.Error(), "Symlink detected: app/evil") {
		t.Errorf("err = %v", err)
	}
	p = buildTarGz(t, []string{"app/", "app/themes/"}, nil,
		map[string]string{"app/node_modules/pkg/.bin/tool": "x"})
	if err := ValidateTarFile(p); err != nil {
		t.Errorf("exempt symlink rejected: %v", err)
	}
}

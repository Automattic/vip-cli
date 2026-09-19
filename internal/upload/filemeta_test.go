package upload

import (
	"bytes"
	"compress/gzip"
	"os"
	"path/filepath"
	"testing"
)

func writeTemp(t *testing.T, name string, content []byte) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(p, content, 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestDetectCompressedMimeType(t *testing.T) {
	gz := writeTemp(t, "x.bin", []byte{0x1f, 0x8b, 0x08, 0x00, 0x00})
	zip := writeTemp(t, "y.bin", []byte{0x50, 0x4b, 0x03, 0x04, 0x00})
	plain := writeTemp(t, "z.sql", []byte("SELECT 1;\n"))
	short := writeTemp(t, "s.bin", []byte{0x1f, 0x8b})

	for path, want := range map[string]string{
		gz: "application/gzip", zip: "application/zip", plain: "", short: "application/gzip",
	} {
		got, err := DetectCompressedMimeType(path)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("%s: got %q want %q", path, got, want)
		}
	}
}

func TestGetFileMeta(t *testing.T) {
	p := writeTemp(t, "dump.sql", []byte("CREATE TABLE wp_posts;\n"))
	meta, err := GetFileMeta(p)
	if err != nil {
		t.Fatal(err)
	}
	if meta.BaseName != "dump.sql" || meta.IsCompressed || meta.FileSize != 23 {
		t.Errorf("meta = %+v", meta)
	}
}

func TestFileHashMD5(t *testing.T) {
	p := writeTemp(t, "h.txt", []byte("hello"))
	got, err := FileHash(p, "md5")
	if err != nil {
		t.Fatal(err)
	}
	if got != "5d41402abc4b2a76b9719d911017c592" {
		t.Errorf("md5 = %q", got)
	}
}

func TestFileHashSHA256(t *testing.T) {
	p := writeTemp(t, "h.txt", []byte("hello"))
	got, err := FileHash(p, "sha256")
	if err != nil {
		t.Fatal(err)
	}
	if got != "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" {
		t.Errorf("sha256 = %q", got)
	}
}

func TestGzipFileRoundTrip(t *testing.T) {
	src := writeTemp(t, "in.sql", bytes.Repeat([]byte("a"), 4096))
	dst := filepath.Join(t.TempDir(), "out.sql.gz")
	if err := GzipFile(src, dst); err != nil {
		t.Fatal(err)
	}
	f, err := os.Open(dst)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if _, err := out.ReadFrom(zr); err != nil {
		t.Fatal(err)
	}
	if out.Len() != 4096 {
		t.Errorf("round-trip len = %d", out.Len())
	}
}

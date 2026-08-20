package devenv

import (
	"bytes"
	"compress/gzip"
	"os"
	"path/filepath"
	"testing"
)

// writeGzip writes data gzip-compressed to path.
func writeGzip(t *testing.T, path string, data []byte) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	zw := gzip.NewWriter(f)
	if _, err := zw.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
}

// TestDumpCompression pins the magic-byte detection (Node's
// detectCompressedMimeType: 1f8b→gzip, 504b0304→zip, else uncompressed).
func TestDumpCompression(t *testing.T) {
	dir := t.TempDir()

	plain := filepath.Join(dir, "plain.sql")
	if err := os.WriteFile(plain, []byte("-- metadata.header 10\nhello"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got, err := dumpCompression(plain); err != nil || got != "" {
		t.Fatalf("plain: got %q err %v, want \"\"", got, err)
	}

	gz := filepath.Join(dir, "dump.sql.gz")
	writeGzip(t, gz, []byte("-- metadata.header 10\nhello"))
	if got, err := dumpCompression(gz); err != nil || got != "gzip" {
		t.Fatalf("gzip: got %q err %v, want \"gzip\"", got, err)
	}

	zip := filepath.Join(dir, "dump.zip")
	if err := os.WriteFile(zip, []byte{0x50, 0x4b, 0x03, 0x04, 0x00}, 0o600); err != nil {
		t.Fatal(err)
	}
	if got, err := dumpCompression(zip); err != nil || got != "zip" {
		t.Fatalf("zip: got %q err %v, want \"zip\"", got, err)
	}
}

// TestDecompressDumpToTemp is the regression test for the import hang: a gzipped
// MyDumper stream MUST be decompressed to its plaintext `-- <file> <len>`
// framing before it reaches myloader --stream. Feeding raw gzip bytes makes
// myloader read zero files and hang.
func TestDecompressDumpToTemp(t *testing.T) {
	dir := t.TempDir()
	// Realistic MyDumper stream framing.
	content := []byte("\n-- metadata.header 5\nabcde\n-- t-schema-create.sql 3\nxyz")
	gz := filepath.Join(dir, "dump.sql.gz")
	writeGzip(t, gz, content)

	path, cleanup, err := decompressDumpToTemp(gz)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, content) {
		t.Fatalf("decompressed mismatch:\n got %q\nwant %q", got, content)
	}
	// The whole point: output must be the plaintext stream, NOT gzip magic.
	if len(got) >= 2 && got[0] == 0x1f && got[1] == 0x8b {
		t.Fatalf("decompressed output still starts with gzip magic")
	}

	// cleanup removes the temp artifact.
	cleanup()
	if _, statErr := os.Stat(path); !os.IsNotExist(statErr) {
		t.Fatalf("cleanup did not remove temp file %s (err=%v)", path, statErr)
	}
}

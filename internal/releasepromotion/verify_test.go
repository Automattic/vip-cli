package releasepromotion

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type fixtureMutation int

const (
	corruptChecksum fixtureMutation = iota
	addReadmeEntry
	addNestedVIPNext
	replaceVIPNextWithSymlink
	removeWindowsExtensions
)

type archiveEntry struct {
	name     string
	typeflag byte
}

func TestVerifyDownloads(t *testing.T) {
	root := t.TempDir()
	writeCompleteArtifactSet(t, root)
	if err := VerifyDownloads(root); err != nil {
		t.Fatal(err)
	}
}

func TestVerifyDownloadsRejectsInvalidArtifacts(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		mutation fixtureMutation
		want     string
	}{
		{"checksum mismatch", corruptChecksum, "checksum mismatch"},
		{"extra tar entry", addReadmeEntry, "unexpected archive entry"},
		{"nested tar entry", addNestedVIPNext, "top-level"},
		{"symbolic link", replaceVIPNextWithSymlink, "regular file"},
		{"wrong Windows names", removeWindowsExtensions, "archive entries"},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			writeCompleteArtifactSet(t, root)
			applyFixtureMutation(t, root, tt.mutation)
			err := VerifyDownloads(root)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("VerifyDownloads() error = %v, want substring %q", err, tt.want)
			}
		})
	}
}

func TestVerifyDownloadsRejectsMalformedChecksum(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeCompleteArtifactSet(t, root)
	checksumPath := filepath.Join(root, "vip-next-darwin-amd64.tar.gz.sha256")
	if err := os.WriteFile(checksumPath, []byte("abc\nsecond line\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := VerifyDownloads(root); err == nil || !strings.Contains(err.Error(), "checksum file") {
		t.Fatalf("VerifyDownloads() error = %v, want malformed checksum error", err)
	}
}

func writeCompleteArtifactSet(t *testing.T, root string) {
	t.Helper()
	archiveNumber := 0
	for _, artifactPath := range ExpectedArtifactPaths() {
		if strings.HasSuffix(artifactPath, ".sha256") {
			continue
		}
		archiveName := filepath.Base(artifactPath)
		entries := []archiveEntry{{name: "vip-next", typeflag: tar.TypeReg}, {name: "go-search-replace", typeflag: tar.TypeReg}}
		if strings.Contains(archiveName, "windows") {
			entries = []archiveEntry{{name: "vip-next.exe", typeflag: tar.TypeReg}, {name: "go-search-replace.exe", typeflag: tar.TypeReg}}
		}
		writeArchive(t, filepath.Join(root, archiveName), entries)
		writeChecksum(t, root, archiveName, archiveNumber%2 == 0, archiveNumber == 1)
		archiveNumber++
	}
}

func applyFixtureMutation(t *testing.T, root string, mutation fixtureMutation) {
	t.Helper()
	archiveName := "vip-next-darwin-amd64.tar.gz"
	entries := []archiveEntry{{name: "vip-next", typeflag: tar.TypeReg}, {name: "go-search-replace", typeflag: tar.TypeReg}}

	switch mutation {
	case corruptChecksum:
		checksumPath := filepath.Join(root, archiveName+".sha256")
		if err := os.WriteFile(checksumPath, []byte(strings.Repeat("0", 64)+"  dist/"+archiveName+"\n"), 0o600); err != nil {
			t.Fatal(err)
		}
		return
	case addReadmeEntry:
		entries = append(entries, archiveEntry{name: "README.md", typeflag: tar.TypeReg})
	case addNestedVIPNext:
		entries[0].name = "bin/vip-next"
	case replaceVIPNextWithSymlink:
		entries[0].typeflag = tar.TypeSymlink
	case removeWindowsExtensions:
		archiveName = "vip-next-windows-amd64.tar.gz"
	default:
		t.Fatalf("unknown fixture mutation %d", mutation)
	}

	writeArchive(t, filepath.Join(root, archiveName), entries)
	writeChecksum(t, root, archiveName, false, false)
}

func writeArchive(t *testing.T, archivePath string, entries []archiveEntry) {
	t.Helper()
	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(file)
	tw := tar.NewWriter(gz)
	for _, entry := range entries {
		header := &tar.Header{Name: entry.name, Mode: 0o755, Size: 1, Typeflag: entry.typeflag}
		if entry.typeflag == tar.TypeSymlink {
			header.Size = 0
			header.Linkname = "go-search-replace"
		}
		if err := tw.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if header.Size > 0 {
			if _, err := tw.Write([]byte("x")); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func writeChecksum(t *testing.T, root, archiveName string, includeDist, uppercase bool) {
	t.Helper()
	contents, err := os.ReadFile(filepath.Join(root, archiveName))
	if err != nil {
		t.Fatal(err)
	}
	digest := fmt.Sprintf("%x", sha256.Sum256(contents))
	if uppercase {
		digest = strings.ToUpper(digest)
	}
	checksumName := archiveName
	separator := " *"
	if includeDist {
		checksumName = "dist/" + archiveName
		separator = "  "
	}
	if err := os.WriteFile(filepath.Join(root, archiveName+".sha256"), []byte(digest+separator+checksumName+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
}

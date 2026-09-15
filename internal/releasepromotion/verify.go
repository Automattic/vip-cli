package releasepromotion

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

var unixEntries = map[string]struct{}{"vip-next": {}, "go-search-replace": {}}
var windowsEntries = map[string]struct{}{"vip-next.exe": {}, "go-search-replace.exe": {}}

func VerifyDownloads(root string) error {
	paths, err := localArtifactPaths(root)
	if err != nil {
		return err
	}
	for _, artifactPath := range paths {
		if strings.HasSuffix(artifactPath, ".sha256") {
			continue
		}
		archivePath := filepath.Join(root, filepath.Base(artifactPath))
		checksumPath := archivePath + ".sha256"
		if err := verifyChecksum(archivePath, checksumPath); err != nil {
			return fmt.Errorf("verify %s: %w", filepath.Base(archivePath), err)
		}
		if !strings.HasSuffix(artifactPath, ".tar.gz") {
			if err := verifyInstallerContainer(archivePath); err != nil {
				return fmt.Errorf("verify %s: %w", filepath.Base(archivePath), err)
			}
			continue
		}
		expected := unixEntries
		if strings.Contains(filepath.Base(archivePath), "-windows-") {
			expected = windowsEntries
		}
		if err := verifyArchive(archivePath, expected); err != nil {
			return fmt.Errorf("verify %s: %w", filepath.Base(archivePath), err)
		}
	}
	return nil
}

// Platform builders verify the actual payload and platform signature before
// upload. This portable gate checks the container type as well as its checksum;
// it is deliberately not a replacement for native PKG/MSI validation.
func verifyInstallerContainer(name string) error {
	f, err := os.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	magic, minSize := []byte("xar!"), int64(28)
	if strings.HasSuffix(name, ".msi") {
		magic, minSize = []byte{0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1}, 512
	}
	info, err := f.Stat()
	if err != nil {
		return err
	}
	header := make([]byte, len(magic))
	if _, err := io.ReadFull(f, header); err != nil {
		return fmt.Errorf("truncated installer: %w", err)
	}
	if info.Size() < minSize || !bytes.Equal(header, magic) {
		return fmt.Errorf("invalid installer container")
	}
	return nil
}

func verifyChecksum(archivePath, checksumPath string) error {
	checksumFile, err := os.Open(checksumPath)
	if err != nil {
		return fmt.Errorf("open checksum file: %w", err)
	}
	defer checksumFile.Close()

	var line string
	scanner := bufio.NewScanner(checksumFile)
	for scanner.Scan() {
		candidate := strings.TrimSpace(scanner.Text())
		if candidate == "" {
			continue
		}
		if line != "" {
			return fmt.Errorf("checksum file must contain exactly one non-empty line")
		}
		line = candidate
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read checksum file: %w", err)
	}
	fields := strings.Fields(line)
	if len(fields) != 2 || len(fields[0]) != sha256.Size*2 {
		return fmt.Errorf("checksum file must contain a SHA-256 digest and filename")
	}
	checksumName := strings.TrimPrefix(fields[1], "*")
	checksumName = strings.TrimPrefix(checksumName, "dist/")
	if checksumName != filepath.Base(archivePath) {
		return fmt.Errorf("checksum filename %q does not match archive %q", fields[1], filepath.Base(archivePath))
	}
	expected, err := hex.DecodeString(fields[0])
	if err != nil || len(expected) != sha256.Size {
		return fmt.Errorf("checksum file contains an invalid SHA-256 digest")
	}

	archive, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer archive.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, archive); err != nil {
		return fmt.Errorf("hash archive: %w", err)
	}
	if subtle.ConstantTimeCompare(hash.Sum(nil), expected) != 1 {
		return fmt.Errorf("checksum mismatch")
	}
	return nil
}

func verifyArchive(archivePath string, expected map[string]struct{}) error {
	archive, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer archive.Close()
	gz, err := gzip.NewReader(archive)
	if err != nil {
		return fmt.Errorf("open gzip stream: %w", err)
	}
	defer gz.Close()

	seen := make(map[string]struct{}, len(expected))
	reader := tar.NewReader(gz)
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read tar stream: %w", err)
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA {
			return fmt.Errorf("archive entry %q must be a regular file", header.Name)
		}
		if header.Name == "" || path.Clean(header.Name) != header.Name || strings.Contains(header.Name, "/") {
			return fmt.Errorf("archive entry %q must be a clean top-level name", header.Name)
		}
		if _, ok := expected[header.Name]; !ok {
			return fmt.Errorf("archive entries contain unexpected archive entry %q", header.Name)
		}
		if _, ok := seen[header.Name]; ok {
			return fmt.Errorf("duplicate archive entry %q", header.Name)
		}
		seen[header.Name] = struct{}{}
	}

	if len(seen) != len(expected) {
		missing := make([]string, 0, len(expected)-len(seen))
		for name := range expected {
			if _, ok := seen[name]; !ok {
				missing = append(missing, name)
			}
		}
		sort.Strings(missing)
		return fmt.Errorf("archive entries are incomplete; missing: %s", strings.Join(missing, ", "))
	}
	return nil
}

// ExtractBinaryArchive verifies the checksum and strict two-file archive
// contract before writing signed payload bytes for a downstream installer job.
// The destination must be new; no existing installation can be overwritten.
func ExtractBinaryArchive(platform, archivePath, destination string) error {
	expected := unixEntries
	switch platform {
	case "darwin":
	case "windows":
		expected = windowsEntries
	default:
		return fmt.Errorf("unsupported installer platform %q", platform)
	}
	if err := verifyChecksum(archivePath, archivePath+".sha256"); err != nil {
		return err
	}
	if err := verifyArchive(archivePath, expected); err != nil {
		return err
	}
	if err := os.Mkdir(destination, 0700); err != nil {
		return err
	}
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()
	gz, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gz.Close()
	reader := tar.NewReader(gz)
	for {
		header, err := reader.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		// Recheck names/types on the extraction pass as well.
		if _, ok := expected[header.Name]; !ok || (header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA) {
			return fmt.Errorf("invalid payload entry %q", header.Name)
		}
		out, err := os.OpenFile(filepath.Join(destination, header.Name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0755)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(out, reader)
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
}

package releasepromotion

import (
	"archive/tar"
	"bufio"
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
	for _, artifactPath := range expectedArtifactPaths {
		if !strings.HasSuffix(artifactPath, ".tar.gz") {
			continue
		}
		archivePath := filepath.Join(root, filepath.Base(artifactPath))
		checksumPath := archivePath + ".sha256"
		if err := verifyChecksum(archivePath, checksumPath); err != nil {
			return fmt.Errorf("verify %s: %w", filepath.Base(archivePath), err)
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

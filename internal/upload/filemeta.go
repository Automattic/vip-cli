package upload

import (
	"compress/gzip"
	"crypto/md5" // #nosec G501 -- S3 integrity checksum, Node parity, not a security boundary
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hash"
	"io"
	"os"
	"path/filepath"
)

// FileMeta mirrors Node's FileMeta (client-file-uploader.ts:48).
type FileMeta struct {
	BaseName     string
	FileName     string
	FileSize     int64
	IsCompressed bool
}

// GetFileMeta ports getFileMeta (client-file-uploader.ts:144).
func GetFileMeta(fileName string) (FileMeta, error) {
	fi, err := os.Stat(fileName)
	if err != nil {
		return FileMeta{}, err
	}
	mime, err := DetectCompressedMimeType(fileName)
	if err != nil {
		return FileMeta{}, err
	}
	return FileMeta{
		BaseName:     filepath.Base(fileName),
		FileName:     fileName,
		FileSize:     fi.Size(),
		IsCompressed: mime == "application/zip" || mime == "application/gzip",
	}, nil
}

// DetectCompressedMimeType ports detectCompressedMimeType
// (client-file-uploader.ts:458): sniff the first 4 bytes for the ZIP /
// GZIP magic numbers. Short files (<4 bytes) are fine — Node compares
// hex prefixes against whatever it managed to read, and so do we.
func DetectCompressedMimeType(fileName string) (string, error) {
	f, err := os.Open(fileName) // #nosec G304 -- caller-supplied CLI path
	if err != nil {
		return "", err
	}
	defer f.Close()
	buf := make([]byte, 4)
	n, err := io.ReadFull(f, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return "", err
	}
	header := hex.EncodeToString(buf[:n])
	const zipMagic = "504b0304"
	const gzMagic = "1f8b"
	if len(header) >= len(zipMagic) && header[:len(zipMagic)] == zipMagic {
		return "application/zip", nil
	}
	if len(header) >= len(gzMagic) && header[:len(gzMagic)] == gzMagic {
		return "application/gzip", nil
	}
	return "", nil
}

// FileHash ports getFileHash (client-file-uploader.ts:84): streamed
// md5/sha256 of the file contents, hex-encoded. Error wording matches
// Node's "Could not generate file hash: <cause>".
func FileHash(fileName, hashType string) (string, error) {
	f, err := os.Open(fileName) // #nosec G304
	if err != nil {
		return "", fmt.Errorf("Could not generate file hash: %s", err.Error())
	}
	defer f.Close()
	var h hash.Hash
	switch hashType {
	case "sha256":
		h = sha256.New()
	default:
		h = md5.New() // #nosec G401 -- Node parity
	}
	if _, err := io.Copy(h, f); err != nil {
		return "", fmt.Errorf("Could not generate file hash: %s", err.Error())
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// GzipFile ports gzipFile (client-file-uploader.ts:102). Error wording
// matches Node's "Could not compress file: <cause>".
func GzipFile(src, dst string) error {
	in, err := os.Open(src) // #nosec G304
	if err != nil {
		return fmt.Errorf("Could not compress file: %s", err.Error())
	}
	defer in.Close()
	out, err := os.Create(dst) // #nosec G304
	if err != nil {
		return fmt.Errorf("Could not compress file: %s", err.Error())
	}
	zw := gzip.NewWriter(out)
	if _, err := io.Copy(zw, in); err != nil {
		out.Close()
		return fmt.Errorf("Could not compress file: %s", err.Error())
	}
	if err := zw.Close(); err != nil {
		out.Close()
		return fmt.Errorf("Could not compress file: %s", err.Error())
	}
	return out.Close()
}

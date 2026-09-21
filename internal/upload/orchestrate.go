package upload

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Automattic/vip/internal/debuglog"
)

// UploadResult mirrors uploadImportFileToS3's return
// (client-file-uploader.ts:222).
type UploadResult struct {
	Meta     FileMeta
	Checksum string // hex md5 (or sha256) of the file as uploaded
	Result   string
}

// gzRename mirrors Node's basename.replace(/(.gz)?$/i, '.gz') (ts:193):
// idempotently ensure a single .gz suffix, replacing an existing
// (case-insensitive) one.
func gzRename(base string) string {
	if l := strings.ToLower(base); strings.HasSuffix(l, ".gz") {
		base = base[:len(base)-3]
	}
	return base + ".gz"
}

// UploadImportFile ports uploadImportFileToS3 (client-file-uploader.ts:163):
//  1. gzip-compress when not already compressed and >= CompressThreshold,
//  2. checksum the (possibly compressed) file,
//  3. PutObject below MultipartThreshold, multipart at/above it.
func (c *Client) UploadImportFile(ctx context.Context, appID, envID int64, meta FileMeta, hashType string, progressCb func(string)) (*UploadResult, error) {
	debuglog.Printf(ctx, "vip:lib/client-file-uploader", "File: bytes=%d compressed=%t", meta.FileSize, meta.IsCompressed)
	if !meta.IsCompressed && meta.FileSize >= CompressThreshold {
		debuglog.Printf(ctx, "vip:lib/client-file-uploader", "Compressing file prior to transfer")
		originalSize := meta.FileSize
		tmpDir, err := os.MkdirTemp("", "vip-client-file-uploader")
		if err != nil {
			return nil, fmt.Errorf("Unable to create temporary working directory: %s", err.Error())
		}
		meta.BaseName = gzRename(meta.BaseName)
		compressed := filepath.Join(tmpDir, meta.BaseName)
		if err := GzipFile(meta.FileName, compressed); err != nil {
			return nil, err
		}
		meta.FileName = compressed
		meta.IsCompressed = true
		fi, err := os.Stat(compressed)
		if err != nil {
			return nil, err
		}
		meta.FileSize = fi.Size()
		debuglog.Printf(ctx, "vip:lib/client-file-uploader", "Compression complete: bytes=%d saved_bytes=%d", meta.FileSize, originalSize-meta.FileSize)
	}

	if hashType == "" {
		hashType = "md5"
	}
	debuglog.Printf(ctx, "vip:lib/client-file-uploader", "Calculating file checksum")
	checksum, err := FileHash(meta.FileName, hashType)
	if err != nil {
		return nil, err
	}

	debuglog.Printf(ctx, "vip:lib/client-file-uploader", "Calculated file checksum")

	var result string
	if meta.FileSize < MultipartThreshold {
		result, err = c.uploadUsingPutObject(ctx, appID, envID, meta, progressCb)
	} else {
		result, err = c.uploadUsingMultipart(ctx, appID, envID, meta, UploadPartSize, progressCb)
	}
	if err != nil {
		return nil, err
	}
	debuglog.Printf(ctx, "vip:lib/client-file-uploader", "Upload complete: bytes=%d", meta.FileSize)
	return &UploadResult{Meta: meta, Checksum: checksum, Result: result}, nil
}

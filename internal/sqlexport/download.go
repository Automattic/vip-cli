package sqlexport

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/Automattic/vip/internal/httpproxy"
)

// OnProgress receives (bytesDownloaded, totalBytes); totalBytes is -1
// when the response has no Content-Length (download-file.ts:32).
type OnProgress func(downloaded, total int64)

// DownloadFile ports lib/http/download-file.ts: stream url to
// destinationPath, reporting progress per chunk. On write failure the
// partial file is removed.
func DownloadFile(ctx context.Context, url, destinationPath string, onProgress OnProgress) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("Request to %s failed: %s", url, err.Error())
	}
	// NOT http.DefaultClient: the export URL is presigned, so its query string
	// is the credential. See internal/httpproxy. (Node's download-file.ts uses
	// the global fetch, which proxies nothing at all; the divergence is that a
	// user who set VIP_PROXY now gets the download proxied too — an opt-in they
	// asked for, and the only alternative to leaking a signed URL to an
	// unapproved proxy.)
	resp, err := httpproxy.Client().Do(req)
	if err != nil {
		return fmt.Errorf("Request to %s failed: %s", url, err.Error())
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		// download-file.ts:24 — "Status: <code> <statusText>".
		return fmt.Errorf("Failed to download file. Status: %d %s",
			resp.StatusCode, http.StatusText(resp.StatusCode))
	}

	total := resp.ContentLength // -1 when missing, matching Node's null

	out, err := os.Create(destinationPath) // #nosec G304 -- user-chosen output path
	if err != nil {
		return fmt.Errorf("Failed to write file to disk: %s", err.Error())
	}

	var downloaded int64
	buf := make([]byte, 64*1024)
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := out.Write(buf[:n]); werr != nil {
				out.Close()
				_ = os.Remove(destinationPath) // download-file.ts:51 partial-file cleanup
				return fmt.Errorf("Failed to write file to disk: %s", werr.Error())
			}
			downloaded += int64(n)
			if onProgress != nil {
				onProgress(downloaded, total)
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			out.Close()
			_ = os.Remove(destinationPath)
			return fmt.Errorf("Failed to write file to disk: %s", rerr.Error())
		}
	}
	return out.Close()
}

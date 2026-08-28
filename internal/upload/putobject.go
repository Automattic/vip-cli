package upload

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync/atomic"
)

// progressReader counts bytes read and reports floor(100*read/total)% via
// cb — the PassThrough 'data' handler in Node (client-file-uploader.ts:277).
// read is shared across parts in multipart mode so the percentage reflects
// overall progress (ts:570 totalBytesRead).
type progressReader struct {
	r     io.Reader
	total int64
	read  *atomic.Int64
	cb    func(percentage string)
}

func (p *progressReader) Read(b []byte) (int, error) {
	n, err := p.r.Read(b)
	if n > 0 && p.read != nil {
		read := p.read.Add(int64(n))
		if p.cb != nil && p.total > 0 {
			p.cb(fmt.Sprintf("%d%%", 100*read/p.total))
		}
	}
	return n, err
}

type readCloser struct {
	io.Reader
	closer io.Closer
}

func (rc readCloser) Close() error { return rc.closer.Close() }

// uploadUsingPutObject ports uploadUsingPutObject
// (client-file-uploader.ts:255). Returns "ok" on HTTP 200, otherwise an
// error wrapping the S3 <Error> payload.
func (c *Client) uploadUsingPutObject(ctx context.Context, appID, envID int64, meta FileMeta, progressCb func(string)) (string, error) {
	pre, err := c.GetSignedUploadRequestData(ctx, SignedRequestArgs{
		Action: "PutObject", AppID: appID, EnvID: envID, BaseName: meta.BaseName,
	})
	if err != nil {
		return "", err
	}

	makeBody := func() (io.ReadCloser, error) {
		f, err := os.Open(meta.FileName) // #nosec G304
		if err != nil {
			return nil, err
		}
		var counter atomic.Int64
		return readCloser{
			Reader: &progressReader{r: f, total: meta.FileSize, read: &counter, cb: progressCb},
			closer: f,
		}, nil
	}

	body, err := makeBody()
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, pre.Options.Method, pre.URL, body)
	if err != nil {
		return "", err
	}
	for k, v := range pre.Options.Headers {
		req.Header.Set(k, v)
	}
	// Node forces Content-Length as a string header (ts:273).
	req.Header.Set("Content-Length", fmt.Sprintf("%d", meta.FileSize))
	req.ContentLength = meta.FileSize

	resp, err := c.doWithRetry(req, makeBody)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return "ok", nil
	}
	respBody, _ := io.ReadAll(resp.Body)
	return "", fmt.Errorf("Unable to upload to cloud storage. %s", formatS3Error(respBody, resp))
}

package upload

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
)

// initiateResult is S3's CreateMultipartUpload response
// (client-file-uploader.ts:328).
type initiateResult struct {
	XMLName  xml.Name `xml:"InitiateMultipartUploadResult"`
	UploadId string   `xml:"UploadId"`
}

// etagResult is one element of the CompleteMultipartUpload payload
// (client-file-uploader.ts:664).
type etagResult struct {
	ETag       string
	PartNumber int
}

// uploadUsingMultipart ports uploadUsingMultipart
// (client-file-uploader.ts:338). partSize is parameterized for tests;
// production passes UploadPartSize.
func (c *Client) uploadUsingMultipart(ctx context.Context, appID, envID int64, meta FileMeta, partSize int64, progressCb func(string)) (string, error) {
	pre, err := c.GetSignedUploadRequestData(ctx, SignedRequestArgs{
		Action: "CreateMultipartUpload", AppID: appID, EnvID: envID, BaseName: meta.BaseName,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, pre.Options.Method, pre.URL, nil)
	if err != nil {
		return "", err
	}
	for k, v := range pre.Options.Headers {
		req.Header.Set(k, v)
	}
	resp, err := c.doWithRetry(req, nil)
	if err != nil {
		return "", err
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	var initErr s3Error
	if xml.Unmarshal(body, &initErr) == nil && initErr.Code != "" {
		// Node: "Unable to create cloud storage object. Error: ..." (ts:373)
		return "", fmt.Errorf("Unable to create cloud storage object. Error: %s",
			fmt.Sprintf(`{"Code":%q,"Message":%q}`, initErr.Code, initErr.Message))
	}
	var init initiateResult
	if err := xml.Unmarshal(body, &init); err != nil || init.UploadId == "" {
		// Node: "Unable to get Upload ID from cloud storage. Error: <raw>" (ts:382)
		return "", fmt.Errorf("Unable to get Upload ID from cloud storage. Error: %s", body)
	}

	parts, err := getPartBoundariesWithSize(meta.FileSize, partSize)
	if err != nil {
		return "", err
	}
	etags, err := c.uploadParts(ctx, appID, envID, meta, init.UploadId, parts, progressCb)
	if err != nil {
		return "", err
	}
	return c.completeMultipartUpload(ctx, appID, envID, meta.BaseName, init.UploadId, etags)
}

// uploadParts ports uploadParts (client-file-uploader.ts:517): bounded
// concurrency (MaxConcurrentPartUploads), shared total-bytes counter
// feeding the progress callback.
func (c *Client) uploadParts(ctx context.Context, appID, envID int64, meta FileMeta, uploadID string, parts []PartBoundary, progressCb func(string)) ([]etagResult, error) {
	sem := make(chan struct{}, MaxConcurrentPartUploads)
	results := make([]etagResult, len(parts))
	errs := make([]error, len(parts))
	var totalRead atomic.Int64
	var wg sync.WaitGroup

	for i := range parts {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			etag, err := c.uploadPart(ctx, appID, envID, meta, parts[idx], uploadID, &totalRead, progressCb)
			if err != nil {
				errs[idx] = err
				return
			}
			results[idx] = etagResult{ETag: etag, PartNumber: parts[idx].Index + 1}
		}(i)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			return nil, err
		}
	}
	return results, nil
}

// uploadPart ports uploadPart (client-file-uploader.ts:606): per-part
// presigned PUT of the byte range [Start, End]; the quoted ETag response
// header is unquoted (Node JSON.parse's it — ts:646).
func (c *Client) uploadPart(ctx context.Context, appID, envID int64, meta FileMeta, part PartBoundary, uploadID string, totalRead *atomic.Int64, progressCb func(string)) (string, error) {
	s3PartNumber := part.Index + 1 // S3 multipart is 1-indexed (ts:615)
	pre, err := c.GetSignedUploadRequestData(ctx, SignedRequestArgs{
		Action: "UploadPart", AppID: appID, EnvID: envID, BaseName: meta.BaseName,
		PartNumber: s3PartNumber, UploadID: uploadID,
	})
	if err != nil {
		return "", err
	}

	makeBody := func() (io.ReadCloser, error) {
		f, err := os.Open(meta.FileName) // #nosec G304
		if err != nil {
			return nil, err
		}
		if _, err := f.Seek(part.Start, io.SeekStart); err != nil {
			f.Close()
			return nil, err
		}
		return readCloser{
			Reader: &progressReader{
				r:     io.LimitReader(f, part.PartSize),
				total: meta.FileSize,
				read:  totalRead,
				cb:    progressCb,
			},
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
	req.Header.Set("Content-Length", fmt.Sprintf("%d", part.PartSize)) // ts:631
	req.ContentLength = part.PartSize

	resp, err := c.doWithRetry(req, makeBody)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return strings.Trim(resp.Header.Get("ETag"), `"`), nil
	}
	respBody, _ := io.ReadAll(resp.Body)
	// Node: "Unable to upload file part. Error: ..." (ts:659)
	return "", fmt.Errorf("Unable to upload file part. Error: %s", formatS3Error(respBody, resp))
}

// completeMultipartUpload ports completeMultipartUpload
// (client-file-uploader.ts:696). Returns the raw XML success body (Node
// returns the parsed doc; only its presence matters to callers).
func (c *Client) completeMultipartUpload(ctx context.Context, appID, envID int64, basename, uploadID string, etags []etagResult) (string, error) {
	etagMaps := make([]map[string]any, len(etags))
	for i, e := range etags {
		etagMaps[i] = map[string]any{"ETag": e.ETag, "PartNumber": e.PartNumber}
	}
	pre, err := c.GetSignedUploadRequestData(ctx, SignedRequestArgs{
		Action: "CompleteMultipartUpload", AppID: appID, EnvID: envID,
		BaseName: basename, UploadID: uploadID, EtagResults: etagMaps,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, pre.Options.Method, pre.URL, strings.NewReader(pre.Options.Body))
	if err != nil {
		return "", err
	}
	for k, v := range pre.Options.Headers {
		req.Header.Set(k, v)
	}
	makeBody := func() (io.ReadCloser, error) {
		return io.NopCloser(strings.NewReader(pre.Options.Body)), nil
	}
	resp, err := c.doWithRetry(req, makeBody)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		// Node: throw await response.text() — a bare string (ts:719).
		return "", fmt.Errorf("%s", body)
	}
	// S3 can return 200 with an <Error> body for CompleteMultipartUpload
	// (ts:722 comment block).
	var compErr s3Error
	if xml.Unmarshal(body, &compErr) == nil && compErr.Code != "" {
		return "", fmt.Errorf("Unable to complete the upload. Error: %s",
			fmt.Sprintf(`{"Code":%q,"Message":%q}`, compErr.Code, compErr.Message))
	}
	return string(body), nil
}

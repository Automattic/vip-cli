package upload

import (
	"io"
	"net/http"
	"time"
)

// maxRetries mirrors fetch-retry's `retries: 3` (client-file-uploader.ts:23).
const maxRetries = 3

// doWithRetry replicates fetch-retry's defaults as configured in Node:
// retry on transport (network) errors only — NOT on HTTP status codes
// (fetch-retry's default retryOn is empty) — up to maxRetries extra
// attempts, sleeping 2^attempt seconds between tries (1s, 2s, 4s;
// client-file-uploader.ts:24). makeBody, when non-nil, recreates the
// request body before each retry attempt (streaming bodies are consumed
// by failed attempts).
func (c *Client) doWithRetry(req *http.Request, makeBody func() (io.ReadCloser, error)) (*http.Response, error) {
	delay := c.retryDelay
	if delay == nil {
		delay = func(attempt int) time.Duration {
			return time.Duration(1<<uint(attempt)) * time.Second
		}
	}
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(delay(attempt - 1))
			if makeBody != nil {
				body, err := makeBody()
				if err != nil {
					return nil, err
				}
				req.Body = body
			}
		}
		resp, err := c.httpClient().Do(req)
		if err == nil {
			return resp, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

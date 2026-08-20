package gql

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"syscall"
	"time"
)

type RetryConfig struct {
	MaxAttempts  int
	InitialDelay time.Duration
	MaxDelay     time.Duration
	NoDelay      bool // tests set this to skip sleeps
}

func defaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxAttempts:  5,
		InitialDelay: 1 * time.Second,
		MaxDelay:     5 * time.Second,
	}
}

func NewRetryMiddleware(cfg RetryConfig) Middleware {
	if cfg.MaxAttempts == 0 {
		cfg = defaultRetryConfig()
	}
	return func(next Doer) Doer {
		return &retryDoer{next: next, cfg: cfg}
	}
}

type retryDoer struct {
	next Doer
	cfg  RetryConfig
}

func (r *retryDoer) Do(req *http.Request) (*http.Response, error) {
	var body []byte
	if req.Body != nil {
		var err error
		body, err = io.ReadAll(req.Body)
		if err != nil {
			return nil, err
		}
		req.Body = io.NopCloser(bytes.NewReader(body))
		req.ContentLength = int64(len(body))
	}
	retryable := isRetryableOperation(body)
	var resp *http.Response
	var lastErr error
	for attempt := 1; attempt <= r.cfg.MaxAttempts; attempt++ {
		if attempt > 1 {
			req.Body = io.NopCloser(bytes.NewReader(body))
			req.ContentLength = int64(len(body))
		}
		resp, lastErr = r.next.Do(req)
		if !shouldRetry(resp, lastErr, retryable, attempt, r.cfg.MaxAttempts) {
			return resp, lastErr
		}
		if resp != nil {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}
		if !r.cfg.NoDelay {
			time.Sleep(backoff(attempt, r.cfg.InitialDelay, r.cfg.MaxDelay))
		}
	}
	return resp, lastErr
}

func shouldRetry(resp *http.Response, err error, retryable bool, attempt, maxAttempts int) bool {
	if !retryable {
		return false
	}
	if attempt >= maxAttempts {
		return false
	}
	if err != nil {
		if errors.Is(err, syscall.ECONNREFUSED) {
			return true
		}
		return false
	}
	if resp == nil {
		return false
	}
	if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != 429 {
		return false
	}
	if resp.StatusCode >= 500 || resp.StatusCode == 429 {
		return true
	}
	return false
}

func isRetryableOperation(body []byte) bool {
	op, err := ParseOperationFromBody(body)
	return err == nil && !op.IsMutation
}

func backoff(attempt int, initial, max time.Duration) time.Duration {
	d := initial * time.Duration(1<<uint(attempt-1))
	if d > max {
		return max
	}
	return d
}

package upload

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	json "encoding/json/v2"
)

func TestGetSignedUploadRequestData(t *testing.T) {
	var gotBody map[string]any
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/upload/site-import-presigned-url" {
			t.Errorf("path = %s", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"url":"https://s3.example/x","options":{"method":"PUT","headers":{"X-Amz-Meta":"1"}}}`))
	}))
	defer srv.Close()

	c := &Client{APIHost: srv.URL, Token: "tok", HTTPClient: srv.Client()}
	req, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{
		Action: "PutObject", AppID: 1, EnvID: 2, BaseName: "dump.sql",
	})
	if err != nil {
		t.Fatal(err)
	}
	if req.URL != "https://s3.example/x" || req.Options.Method != "PUT" {
		t.Errorf("req = %+v", req)
	}
	if req.Options.Headers["X-Amz-Meta"] != "1" {
		t.Errorf("headers = %v", req.Options.Headers)
	}
	if gotAuth != "Bearer tok" {
		t.Errorf("auth = %q", gotAuth)
	}
	if gotBody["action"] != "PutObject" || gotBody["basename"] != "dump.sql" {
		t.Errorf("body = %v", gotBody)
	}
}

func TestGetSignedUploadRequestDataDeployTokenOverride(t *testing.T) {
	t.Setenv("WPVIP_DEPLOY_TOKEN", "deploy-tok")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer deploy-tok" {
			t.Errorf("auth = %q", got)
		}
		_, _ = w.Write([]byte(`{"url":"u","options":{"method":"PUT","headers":{}}}`))
	}))
	defer srv.Close()
	c := &Client{APIHost: srv.URL, Token: "tok", HTTPClient: srv.Client()}
	if _, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{
		Action: "PutObject", AppID: 1, EnvID: 2, BaseName: "x",
	}); err != nil {
		t.Fatal(err)
	}
}

func TestGetSignedUploadRequestDataNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "no can do", http.StatusForbidden)
	}))
	defer srv.Close()
	c := &Client{APIHost: srv.URL, Token: "tok", HTTPClient: srv.Client()}
	_, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{
		Action: "PutObject", AppID: 1, EnvID: 2, BaseName: "x",
	})
	// Node: throw new Error(await response.text() || statusText) — ts:433.
	// http.Error appends a newline; the body is used verbatim.
	if err == nil || err.Error() != "no can do\n" {
		t.Errorf("err = %v", err)
	}
}

func TestPresignRetriesReplayBodyAndAuth(t *testing.T) {
	t.Setenv("WPVIP_DEPLOY_TOKEN", "deploy-token")
	var bodies []string
	var auths []string
	var delays []int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read request: %v", err)
		}
		bodies = append(bodies, string(body))
		auths = append(auths, r.Header.Get("Authorization"))
		if r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("request method/headers: %s %v", r.Method, r.Header)
		}
		if len(bodies) < 4 {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte("try later"))
			return
		}
		_, _ = w.Write([]byte(`{"url":"signed","options":{"method":"PUT"}}`))
	}))
	defer srv.Close()
	c := &Client{APIHost: srv.URL, Token: "ordinary-token", HTTPClient: srv.Client(), retryDelay: func(attempt int) time.Duration {
		delays = append(delays, attempt)
		return 0
	}}
	pr, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{Action: "PutObject", AppID: 1, EnvID: 2, BaseName: "x"})
	if err != nil || pr == nil || pr.URL != "signed" {
		t.Fatalf("presign = %+v, %v", pr, err)
	}
	if !reflect.DeepEqual(delays, []int{0, 1, 2}) {
		t.Errorf("delays = %v", delays)
	}
	if len(bodies) != 4 || bodies[0] == "" {
		t.Fatalf("bodies = %v", bodies)
	}
	for i := range bodies {
		if bodies[i] != bodies[0] || auths[i] != "Bearer deploy-token" {
			t.Errorf("attempt %d body/auth = %q, %q", i, bodies[i], auths[i])
		}
	}
}

func TestPresignStatusRetryAndExhaustion(t *testing.T) {
	for _, tc := range []struct {
		name     string
		status   int
		body     string
		attempts int
		wantErr  string
	}{
		{"bad request", 400, "bad request", 1, "bad request"},
		{"unauthorized", 401, "", 1, "401 Unauthorized"},
		{"rate limited", 429, "slow down", 4, "slow down"},
		{"server error", 500, "server failed", 4, "server failed"},
		{"bad gateway", 502, "", 4, "502 Bad Gateway"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			attempts := 0
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				attempts++
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			c := &Client{APIHost: srv.URL, HTTPClient: srv.Client(), retryDelay: func(int) time.Duration { return 0 }}
			_, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{})
			if err == nil || err.Error() != tc.wantErr || attempts != tc.attempts {
				t.Errorf("error = %v, attempts = %d; want %q, %d", err, attempts, tc.wantErr, tc.attempts)
			}
		})
	}
}

func TestPresignNetworkErrorRetries(t *testing.T) {
	attempts := 0
	c := &Client{APIHost: "http://example.invalid", HTTPClient: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		attempts++
		if attempts < 4 {
			return nil, io.ErrUnexpectedEOF
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"url":"ok"}`))}, nil
	})}, retryDelay: func(int) time.Duration { return 0 }}
	pr, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{})
	if err != nil || pr.URL != "ok" || attempts != 4 {
		t.Errorf("presign = %+v, error = %v, attempts = %d", pr, err, attempts)
	}
}

func TestPresignTruncatedHTTP200Body(t *testing.T) {
	for _, succeed := range []bool{true, false} {
		name := "exhaustion"
		if succeed {
			name = "recovery"
		}
		t.Run(name, func(t *testing.T) {
			attempts := 0
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				attempts++
				if !succeed || attempts < 4 {
					w.Header().Set("Content-Length", "100")
					_, _ = w.Write([]byte(`{"url":"incomplete"}`))
					return
				}
				_, _ = w.Write([]byte(`{"url":"complete"}`))
			}))
			defer srv.Close()
			c := &Client{APIHost: srv.URL, HTTPClient: srv.Client(), retryDelay: func(int) time.Duration { return 0 }}
			pr, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{})
			if attempts != 4 {
				t.Errorf("attempts = %d, want 4", attempts)
			}
			if succeed {
				if err != nil || pr == nil || pr.URL != "complete" {
					t.Errorf("presign = %+v, error = %v", pr, err)
				}
			} else if !errors.Is(err, io.ErrUnexpectedEOF) {
				t.Errorf("error = %v, want unexpected EOF", err)
			}
		})
	}
}

func TestPresignMalformedJSONIsNotRetried(t *testing.T) {
	attempts := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		attempts++
		_, _ = w.Write([]byte(`{"url":`))
	}))
	defer srv.Close()
	c := &Client{APIHost: srv.URL, HTTPClient: srv.Client(), retryDelay: func(int) time.Duration { return 0 }}
	_, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{})
	if err == nil || attempts != 1 {
		t.Errorf("error = %v, attempts = %d", err, attempts)
	}
}

type rejectingCloseBody struct {
	io.Reader
	closed *int
}

type readFunc func([]byte) (int, error)

func (f readFunc) Read(p []byte) (int, error) { return f(p) }

func (b rejectingCloseBody) Close() error {
	*b.closed++
	return errors.New("close rejected")
}

func TestPresignCloseErrorDoesNotMaskResult(t *testing.T) {
	closed := 0
	c := &Client{APIHost: "http://example.invalid", HTTPClient: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: rejectingCloseBody{strings.NewReader(`{"url":"ok"}`), &closed}}, nil
	})}}
	pr, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{})
	if err != nil || pr == nil || pr.URL != "ok" || closed != 1 {
		t.Errorf("presign = %+v, error = %v, close count = %d", pr, err, closed)
	}
}

func TestPresignRetryClosesWithoutReadingResponse(t *testing.T) {
	attempts, reads, closes := 0, 0, 0
	c := &Client{APIHost: "http://example.invalid", HTTPClient: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		attempts++
		if attempts == 1 {
			body := rejectingCloseBody{readFunc(func([]byte) (int, error) {
				reads++
				return 0, io.EOF
			}), &closes}
			return &http.Response{StatusCode: 503, Body: body}, nil
		}
		return &http.Response{StatusCode: 200, Body: rejectingCloseBody{strings.NewReader(`{"url":"ok"}`), &closes}}, nil
	})}, retryDelay: func(int) time.Duration { return 0 }}
	pr, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{})
	if err != nil || pr == nil || pr.URL != "ok" || attempts != 2 || reads != 0 || closes != 2 {
		t.Errorf("presign = %+v, error = %v, attempts/reads/closes = %d/%d/%d", pr, err, attempts, reads, closes)
	}
}

func TestPresignCancellationStopsBackoff(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	attempts := 0
	firstAttempt := make(chan struct{})
	c := &Client{APIHost: "http://example.invalid", HTTPClient: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		attempts++
		close(firstAttempt)
		return nil, io.ErrUnexpectedEOF
	})}, retryDelay: func(int) time.Duration { return time.Hour }}
	done := make(chan error, 1)
	go func() {
		_, err := c.GetSignedUploadRequestData(ctx, SignedRequestArgs{})
		done <- err
	}()
	<-firstAttempt
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) || attempts != 1 {
			t.Errorf("error = %v, attempts = %d", err, attempts)
		}
	case <-time.After(time.Second):
		t.Fatal("presign did not stop during backoff")
	}
}

func TestDoWithRetryRetriesNetworkErrorsOnly(t *testing.T) {
	attempts := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		attempts++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	c := &Client{HTTPClient: srv.Client(), retryDelay: func(int) time.Duration { return 0 }}
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	resp, err := c.doWithRetry(req, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	// fetch-retry's default retryOn does NOT retry on HTTP status — only
	// network errors. 500 must come back after exactly 1 attempt.
	if attempts != 1 {
		t.Errorf("attempts = %d, want 1 (no status-code retries)", attempts)
	}
	if resp.StatusCode != 500 {
		t.Errorf("status = %d", resp.StatusCode)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestDoWithRetryNetworkErrorExhaustsAfter4(t *testing.T) {
	attempts := 0
	c := &Client{
		HTTPClient: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			attempts++
			return nil, io.ErrUnexpectedEOF
		})},
		retryDelay: func(int) time.Duration { return 0 },
	}
	req, _ := http.NewRequest(http.MethodGet, "http://example.invalid", nil)
	if _, err := c.doWithRetry(req, nil); err == nil {
		t.Fatal("want error")
	}
	// retries: 3 → 4 total attempts (fetch-retry semantics)
	if attempts != 4 {
		t.Errorf("attempts = %d, want 4", attempts)
	}
}

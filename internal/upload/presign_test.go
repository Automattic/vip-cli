package upload

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
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

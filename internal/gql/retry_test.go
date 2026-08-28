package gql

import (
	json "encoding/json/v2"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func graphqlBody(t *testing.T, operationName, query string) string {
	t.Helper()
	b, err := json.Marshal(map[string]any{
		"operationName": operationName,
		"query":         query,
	})
	if err != nil {
		t.Fatalf("marshal GraphQL body: %v", err)
	}
	return string(b)
}

func TestRetryQueryOn5xx(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&calls, 1)
		if n < 3 {
			w.WriteHeader(503)
			return
		}
		w.WriteHeader(200)
		w.Write([]byte(`{"data":{"me":null}}`))
	}))
	defer srv.Close()

	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewRetryMiddleware(RetryConfig{MaxAttempts: 5, NoDelay: true})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"query Me{me{id}}"}`))
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if calls != 3 {
		t.Errorf("calls = %d, want 3", calls)
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
}

func TestNoRetryOnMutation(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(503)
	}))
	defer srv.Close()
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewRetryMiddleware(RetryConfig{MaxAttempts: 5, NoDelay: true})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"DoThing","query":"mutation DoThing{doThing{ok}}"}`))
	c.Do(req)
	if calls != 1 {
		t.Errorf("mutation must not retry; calls = %d, want 1", calls)
	}
}

func TestGeneratedMutationNeverRetries(t *testing.T) {
	for _, status := range []int{http.StatusInternalServerError, http.StatusTooManyRequests} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			var calls int32
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				atomic.AddInt32(&calls, 1)
				w.WriteHeader(status)
			}))
			defer srv.Close()

			c := NewClient(Config{
				APIHost:  srv.URL,
				TestMode: true,
				Middleware: []Middleware{NewRetryMiddleware(RetryConfig{
					MaxAttempts: 5,
					NoDelay:     true,
				})},
			})
			req, err := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(
				graphqlBody(t, "AbortMediaImport", AbortMediaImport_Operation),
			))
			if err != nil {
				t.Fatalf("NewRequest: %v", err)
			}
			resp, _ := c.Do(req)
			if resp != nil {
				resp.Body.Close()
			}
			if calls != 1 {
				t.Fatalf("generated mutation status %d calls = %d, want 1", status, calls)
			}
		})
	}
}

func TestUnparseableOperationNeverRetries(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()
	c := NewClient(Config{
		APIHost:  srv.URL,
		TestMode: true,
		Middleware: []Middleware{NewRetryMiddleware(RetryConfig{
			MaxAttempts: 5,
			NoDelay:     true,
		})},
	})
	req, err := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`not-json`))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	resp, _ := c.Do(req)
	if resp != nil {
		resp.Body.Close()
	}
	if calls != 1 {
		t.Fatalf("unparseable operation calls = %d, want 1", calls)
	}
}

func TestGeneratedMultilineQueryStillRetries(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		n := atomic.AddInt32(&calls, 1)
		if n < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	c := NewClient(Config{
		APIHost:  srv.URL,
		TestMode: true,
		Middleware: []Middleware{NewRetryMiddleware(RetryConfig{
			MaxAttempts: 5,
			NoDelay:     true,
		})},
	})
	req, err := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(
		graphqlBody(t, "Me", Me_Operation),
	))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	resp.Body.Close()
	if calls != 3 {
		t.Fatalf("generated query calls = %d, want 3", calls)
	}
}

func TestNoRetryOn4xxExcept429(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(401)
	}))
	defer srv.Close()
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewRetryMiddleware(RetryConfig{MaxAttempts: 5, NoDelay: true})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"query Me{me{id}}"}`))
	c.Do(req)
	if calls != 1 {
		t.Errorf("4xx (not 429) must not retry; calls = %d, want 1", calls)
	}
}

func TestRetryOn429(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&calls, 1)
		if n == 1 {
			w.WriteHeader(429)
			return
		}
		w.WriteHeader(200)
		w.Write([]byte(`{"data":{}}`))
	}))
	defer srv.Close()
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewRetryMiddleware(RetryConfig{MaxAttempts: 5, NoDelay: true})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"query Me{me{id}}"}`))
	c.Do(req)
	if calls != 2 {
		t.Errorf("429 must retry; calls = %d, want 2", calls)
	}
}

func TestRetryStopsAfterMaxAttempts(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(503)
	}))
	defer srv.Close()
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewRetryMiddleware(RetryConfig{MaxAttempts: 3, NoDelay: true})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"query Me{me{id}}"}`))
	c.Do(req)
	if calls != 3 {
		t.Errorf("retry must stop at MaxAttempts; calls = %d, want 3", calls)
	}
}

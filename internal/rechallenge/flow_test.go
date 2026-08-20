package rechallenge

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeTracker struct {
	mu     sync.Mutex
	events []string
}

func (f *fakeTracker) Track(name string, _ map[string]any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, name)
}

func TestFlowUnsupportedVersion(t *testing.T) {
	cache := newTestCache()
	tr := &fakeTracker{}
	r := &Runner{Tracker: tr, TokenCache: cache}
	_, err := r.Run(context.Background(), RunInput{
		RequestedOperation: "doThing",
		Extension: Extension{
			Version:              "v99",
			CreateSessionPath:    "/x",
			StatusPathTemplate:   "/x/{challengeId}",
			ExchangePathTemplate: "/x/{challengeId}/e",
			ElevatedHeaderName:   "x-elevated-token",
		},
	})
	var ver *UnsupportedVersionError
	if !errors.As(err, &ver) {
		t.Fatalf("err = %T, want *UnsupportedVersionError", err)
	}
}

func TestFlowHappyPathVerified(t *testing.T) {
	pollCount := int32(0)
	mux := http.NewServeMux()
	mux.HandleFunc("/p/v2/cli/sessions", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v/c1","pollIntervalSeconds":0,"expiresAt":"` + time.Now().Add(time.Hour).Format(time.RFC3339) + `"}`))
	})
	mux.HandleFunc("/p/v2/cli/sessions/c1", func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&pollCount, 1)
		if n < 2 {
			w.Write([]byte(`{"challengeId":"c1","status":"pending","expiresAt":"` + time.Now().Add(time.Hour).Format(time.RFC3339) + `","pollIntervalSeconds":0}`))
			return
		}
		w.Write([]byte(`{"challengeId":"c1","status":"verified","expiresAt":"` + time.Now().Add(time.Hour).Format(time.RFC3339) + `","pollIntervalSeconds":0,"provider":"passkeys"}`))
	})
	mux.HandleFunc("/p/v2/cli/sessions/c1/exchange", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"elevatedToken":{"token":"opaque","expiresAt":"` + time.Now().Add(2*time.Hour).Format(time.RFC3339) + `","purpose":"doThing"}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	tr := &fakeTracker{}
	cache := newTestCache()
	var out bytes.Buffer
	openCalled := int32(0)
	r := &Runner{
		Client:     &Client{APIHost: srv.URL, HTTP: srv.Client()},
		Tracker:    tr,
		TokenCache: cache,
		Stdout:     &out,
		OpenURL:    func(string) { atomic.AddInt32(&openCalled, 1) },
		Sleep:      func(_ context.Context, _ time.Duration) error { return nil },
	}

	tok, err := r.Run(context.Background(), RunInput{
		RequestedOperation: "doThing",
		Interactive:        true,
		Extension: Extension{
			Version:              Version,
			CreateSessionPath:    "/p/v2/cli/sessions",
			StatusPathTemplate:   srv.URL + "/p/v2/cli/sessions/{challengeId}",
			ExchangePathTemplate: srv.URL + "/p/v2/cli/sessions/{challengeId}/exchange",
			ElevatedHeaderName:   "x-elevated-token",
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if tok.Token != "opaque" {
		t.Errorf("token = %q", tok.Token)
	}
	if atomic.LoadInt32(&openCalled) != 1 {
		t.Errorf("OpenURL called %d times, want 1", openCalled)
	}
	wantSubseq := []string{
		"rechallenge_required",
		"rechallenge_session_created",
		"rechallenge_verified",
		"rechallenge_exchanged",
	}
	for _, w := range wantSubseq {
		if !containsString(tr.events, w) {
			t.Errorf("missing event %q in %v", w, tr.events)
		}
	}
	if !strings.Contains(out.String(), "https://example/v/c1") {
		t.Errorf("stdout missing verification URL: %q", out.String())
	}
	// Cache must hold the token under scope.
	cached, _ := cache.Get("doThing")
	if cached == nil || cached.Token != "opaque" {
		t.Errorf("cache.Get = %+v, want token opaque", cached)
	}
}

func TestFlowTerminalCancelled(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/p/v2/cli/sessions", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v","pollIntervalSeconds":0,"expiresAt":"` + time.Now().Add(time.Hour).Format(time.RFC3339) + `"}`))
	})
	mux.HandleFunc("/p/v2/cli/sessions/c1", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"cancelled","expiresAt":"` + time.Now().Add(time.Hour).Format(time.RFC3339) + `","pollIntervalSeconds":0,"statusReason":{"code":"user","message":"user cancelled"}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	r := &Runner{
		Client:     &Client{APIHost: srv.URL, HTTP: srv.Client()},
		Tracker:    &fakeTracker{},
		TokenCache: newTestCache(),
		Sleep:      func(_ context.Context, _ time.Duration) error { return nil },
	}
	_, err := r.Run(context.Background(), RunInput{
		RequestedOperation: "doThing",
		// Interactive: only an interactive (or explicitly waiting) session
		// gets as far as polling — see TestFlowNonInteractiveFailsFastInsteadOfPolling.
		Interactive: true,
		Extension: Extension{
			Version:              Version,
			CreateSessionPath:    "/p/v2/cli/sessions",
			StatusPathTemplate:   srv.URL + "/p/v2/cli/sessions/{challengeId}",
			ExchangePathTemplate: srv.URL + "/p/v2/cli/sessions/{challengeId}/x",
			ElevatedHeaderName:   "x-elevated-token",
		},
	})
	var terr *TerminalError
	if !errors.As(err, &terr) {
		t.Fatalf("err = %T (%v); want *TerminalError", err, err)
	}
	if terr.Status() != StatusCancelled {
		t.Errorf("Status = %q", terr.Status())
	}
	if !strings.Contains(err.Error(), "user cancelled") {
		t.Errorf("err must include statusReason detail: %v", err)
	}
}

func TestFlowAbortedByContext(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v","pollIntervalSeconds":1,"expiresAt":"` + time.Now().Add(time.Hour).Format(time.RFC3339) + `"}`))
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	r := &Runner{
		Client:     &Client{APIHost: srv.URL, HTTP: srv.Client()},
		Tracker:    &fakeTracker{},
		TokenCache: newTestCache(),
		Sleep: func(ctx context.Context, _ time.Duration) error {
			<-ctx.Done()
			return ctx.Err()
		},
	}
	cancel() // cancel before Run starts polling
	_, err := r.Run(ctx, RunInput{
		RequestedOperation: "doThing",
		Interactive:        true,
		Extension: Extension{
			Version:              Version,
			CreateSessionPath:    "/x",
			StatusPathTemplate:   "/x/{challengeId}",
			ExchangePathTemplate: "/x/{challengeId}/e",
			ElevatedHeaderName:   "x-elevated-token",
		},
	})
	var aerr *AbortedError
	if !errors.As(err, &aerr) {
		t.Errorf("err = %T, want *AbortedError", err)
	}
}

func containsString(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

package gql

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/rechallenge"
)

func newTestRechallengeCache() *rechallenge.TokenCache {
	return &rechallenge.TokenCache{
		Keychain: &keychain.Keychain{Backend: &keychainMemBackend{}, Service: "vip-next-cli:elevated"},
	}
}

type keychainMemBackend struct{ store map[string]string }

func (m *keychainMemBackend) Set(s, u, p string) error {
	if m.store == nil {
		m.store = map[string]string{}
	}
	m.store[s+"|"+u] = p
	return nil
}
func (m *keychainMemBackend) Get(s, u string) (string, error) {
	if v, ok := m.store[s+"|"+u]; ok {
		return v, nil
	}
	return "", keychain.ErrNotFound
}
func (m *keychainMemBackend) Delete(s, u string) error {
	if _, ok := m.store[s+"|"+u]; !ok {
		return keychain.ErrNotFound
	}
	delete(m.store, s+"|"+u)
	return nil
}

func TestRechallengePassThroughQuery(t *testing.T) {
	calls := int32(0)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Write([]byte(`{"data":{"me":null}}`))
	}))
	defer srv.Close()
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewRechallengeMiddleware(RechallengeConfig{
			TokenCache: newTestRechallengeCache(),
		})},
	})
	body := `{"operationName":"Me","query":"query Me{me{id}}"}`
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(body))
	if _, err := c.Do(req); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if calls != 1 {
		t.Errorf("calls = %d, want 1 (query — no rechallenge)", calls)
	}
}

func TestRechallengePreflightAttachesCachedToken(t *testing.T) {
	var seenHeader string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenHeader = r.Header.Get("x-elevated-token")
		w.Write([]byte(`{"data":{"updateDefensiveModeStatus":{"success":true}}}`))
	}))
	defer srv.Close()
	cache := newTestRechallengeCache()
	cache.Set("updateDefensiveModeStatus", rechallenge.ElevatedToken{
		Token:      "cached-token",
		ExpiresAt:  time.Now().Add(time.Hour),
		HeaderName: "x-elevated-token",
	})
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewRechallengeMiddleware(RechallengeConfig{TokenCache: cache})},
	})
	body := `{"operationName":"U","query":"mutation U{updateDefensiveModeStatus(input:{}){success}}"}`
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(body))
	if _, err := c.Do(req); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if seenHeader != "cached-token" {
		t.Errorf("x-elevated-token header = %q, want cached-token", seenHeader)
	}
}

func TestRechallengeFullFlowOnElevatedError(t *testing.T) {
	mutationHits := int32(0)
	var headerAfterRetry string

	parker := http.NewServeMux()
	parker.HandleFunc("/parker/sessions", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v","pollIntervalSeconds":0,"expiresAt":"` + time.Now().Add(time.Hour).Format(time.RFC3339) + `"}`))
	})
	parker.HandleFunc("/parker/sessions/c1", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"verified","expiresAt":"` + time.Now().Add(time.Hour).Format(time.RFC3339) + `","pollIntervalSeconds":0,"provider":"passkeys"}`))
	})
	parker.HandleFunc("/parker/sessions/c1/exchange", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"elevatedToken":{"token":"elev","expiresAt":"` + time.Now().Add(2*time.Hour).Format(time.RFC3339) + `","purpose":"u"}}`))
	})
	parkerSrv := httptest.NewServer(parker)
	defer parkerSrv.Close()

	gql := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&mutationHits, 1)
		if n == 1 {
			w.Write([]byte(`{"errors":[{"message":"elev required","extensions":{"code":"elevated-permission-required","rechallenge":{"version":"v2","createSessionPath":"` + parkerSrv.URL + `/parker/sessions","statusPathTemplate":"` + parkerSrv.URL + `/parker/sessions/{challengeId}","exchangePathTemplate":"` + parkerSrv.URL + `/parker/sessions/{challengeId}/exchange","elevatedHeaderName":"x-elevated-token"}}}]}`))
			return
		}
		headerAfterRetry = r.Header.Get("x-elevated-token")
		w.Write([]byte(`{"data":{"updateDefensiveModeStatus":{"success":true}}}`))
	}))
	defer gql.Close()

	cache := newTestRechallengeCache()
	runner := &rechallenge.Runner{
		Client:     &rechallenge.Client{APIHost: parkerSrv.URL, HTTP: parkerSrv.Client()},
		TokenCache: cache,
		Sleep:      func(_ context.Context, _ time.Duration) error { return nil },
	}
	c := NewClient(Config{
		APIHost: gql.URL, TestMode: true,
		Middleware: []Middleware{NewRechallengeMiddleware(RechallengeConfig{
			TokenCache: cache,
			Runner:     runner,
			// `go test` has no TTY, so the default sensor would report
			// non-interactive and (correctly) refuse to open a challenge.
			Interactive: func() bool { return true },
		})},
	})

	body := `{"operationName":"U","query":"mutation U{updateDefensiveModeStatus(input:{}){success}}"}`
	req, _ := http.NewRequest("POST", gql.URL+"/graphql", strings.NewReader(body))
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	out, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(out), `"success":true`) {
		t.Errorf("expected success after replay; body = %s", out)
	}
	if mutationHits != 2 {
		t.Errorf("mutation hits = %d, want 2 (one bounce + one retry)", mutationHits)
	}
	if headerAfterRetry != "elev" {
		t.Errorf("retry header = %q, want elev", headerAfterRetry)
	}
}

func TestRechallengeSurfacesOriginalErrorOnFlowFailure(t *testing.T) {
	parker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		w.Write([]byte("parker boom"))
	}))
	defer parker.Close()
	gqlHits := int32(0)
	gql := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&gqlHits, 1)
		w.Write([]byte(`{"errors":[{"message":"elev required","extensions":{"code":"elevated-permission-required","rechallenge":{"version":"v2","createSessionPath":"` + parker.URL + `/x","statusPathTemplate":"` + parker.URL + `/x/{challengeId}","exchangePathTemplate":"` + parker.URL + `/x/{challengeId}/y","elevatedHeaderName":"x-elevated-token"}}}]}`))
	}))
	defer gql.Close()
	cache := newTestRechallengeCache()
	runner := &rechallenge.Runner{
		Client:     &rechallenge.Client{APIHost: parker.URL, HTTP: parker.Client()},
		TokenCache: cache,
		Sleep:      func(_ context.Context, _ time.Duration) error { return nil },
	}
	c := NewClient(Config{
		APIHost: gql.URL, TestMode: true,
		Middleware: []Middleware{NewRechallengeMiddleware(RechallengeConfig{
			TokenCache: cache, Runner: runner, Stderr: io.Discard,
			// Interactive so the failure under test is Parker's HTTP 500 and
			// not the non-interactive refusal that precedes it.
			Interactive: func() bool { return true },
		})},
	})
	body := `{"operationName":"U","query":"mutation U{updateDefensiveModeStatus(input:{}){success}}"}`
	req, _ := http.NewRequest("POST", gql.URL+"/graphql", strings.NewReader(body))
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	// Mutation should NOT have retried (gqlHits == 1).
	if gqlHits != 1 {
		t.Errorf("gql hits = %d, want 1 (no retry when Parker fails)", gqlHits)
	}
	out, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(out), "elevated-permission-required") {
		t.Errorf("original error must be surfaced; body = %s", out)
	}
}

func TestRechallengeUsesConfigInteractivityProvider(t *testing.T) {
	parker := http.NewServeMux()
	parker.HandleFunc("/parker/sessions", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v","pollIntervalSeconds":0,"expiresAt":"` + time.Now().Add(time.Hour).Format(time.RFC3339) + `"}`))
	})
	parker.HandleFunc("/parker/sessions/c1", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"verified","expiresAt":"` + time.Now().Add(time.Hour).Format(time.RFC3339) + `","pollIntervalSeconds":0,"provider":"passkeys"}`))
	})
	parker.HandleFunc("/parker/sessions/c1/exchange", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"elevatedToken":{"token":"elev","expiresAt":"` + time.Now().Add(2*time.Hour).Format(time.RFC3339) + `","purpose":"u"}}`))
	})
	parkerSrv := httptest.NewServer(parker)
	defer parkerSrv.Close()

	mutationHits := int32(0)
	gql := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&mutationHits, 1)
		if n == 1 {
			w.Write([]byte(`{"errors":[{"message":"elev required","extensions":{"code":"elevated-permission-required","rechallenge":{"version":"v2","createSessionPath":"` + parkerSrv.URL + `/parker/sessions","statusPathTemplate":"` + parkerSrv.URL + `/parker/sessions/{challengeId}","exchangePathTemplate":"` + parkerSrv.URL + `/parker/sessions/{challengeId}/exchange","elevatedHeaderName":"x-elevated-token"}}}]}`))
			return
		}
		w.Write([]byte(`{"data":{"updateDefensiveModeStatus":{"success":true}}}`))
	}))
	defer gql.Close()

	cache := newTestRechallengeCache()
	runner := &rechallenge.Runner{
		Client:     &rechallenge.Client{APIHost: parkerSrv.URL, HTTP: parkerSrv.Client()},
		TokenCache: cache,
		Sleep:      func(_ context.Context, _ time.Duration) error { return nil },
	}

	var interactiveCalls int32
	c := NewClient(Config{
		APIHost: gql.URL, TestMode: true,
		Middleware: []Middleware{NewRechallengeMiddleware(RechallengeConfig{
			TokenCache: cache,
			Runner:     runner,
			// Returning true is what makes this test meaningful: the default
			// sensor reports non-interactive under `go test` (no TTY), so the
			// flow can only reach Parker if the injected provider was consulted.
			Interactive: func() bool {
				atomic.AddInt32(&interactiveCalls, 1)
				return true
			},
		})},
	})

	body := `{"operationName":"U","query":"mutation U{updateDefensiveModeStatus(input:{}){success}}"}`
	req, _ := http.NewRequest("POST", gql.URL+"/graphql", strings.NewReader(body))
	if _, err := c.Do(req); err != nil {
		t.Fatalf("Do: %v", err)
	}
	// Must have entered the elevated-flow code path (one bounce + one retry).
	if mutationHits < 2 {
		t.Errorf("mutation hits = %d, want >= 2 (elevated flow must run for this assertion to be meaningful)", mutationHits)
	}
	if got := atomic.LoadInt32(&interactiveCalls); got < 1 {
		t.Errorf("Interactive provider never called; got %d calls", got)
	}
}

// elevatedBouncer serves a GraphQL endpoint that answers every mutation with an
// elevated-permission-required error pointing at parkerURL.
func elevatedBouncer(t *testing.T, parkerURL string, hits *int32) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if hits != nil {
			atomic.AddInt32(hits, 1)
		}
		w.Write([]byte(`{"errors":[{"message":"You do not have permission to perform this action.","extensions":{"code":"elevated-permission-required","rechallenge":{"version":"v2","createSessionPath":"` +
			parkerURL + `/x","statusPathTemplate":"` + parkerURL + `/x/{challengeId}","exchangePathTemplate":"` +
			parkerURL + `/x/{challengeId}/y","elevatedHeaderName":"x-elevated-token"}}}]}`))
	}))
	t.Cleanup(srv.Close)
	return srv
}

const mutationBody = `{"operationName":"U","query":"mutation U{updateDefensiveModeStatus(input:{}){success}}"}`

// TestRechallengeSurfacesStepUpFailureReason: when step-up fails, the reason was
// dropped on the floor (`if runErr != nil { return resp, nil }`) and the user saw
// only the generic "you do not have permission" error the server had already
// sent. The diagnosis was in hand and thrown away — same class of bug as
// 78d0a615 in parity/parker_discovery.go.
func TestRechallengeSurfacesStepUpFailureReason(t *testing.T) {
	parker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
		w.Write([]byte(`{"error":"step-up provider unavailable"}`))
	}))
	defer parker.Close()
	gqlSrv := elevatedBouncer(t, parker.URL, nil)

	var stderr strings.Builder
	cache := newTestRechallengeCache()
	c := NewClient(Config{
		APIHost: gqlSrv.URL, TestMode: true,
		Middleware: []Middleware{NewRechallengeMiddleware(RechallengeConfig{
			TokenCache: cache,
			Stderr:     &stderr,
			Runner: &rechallenge.Runner{
				Client:     &rechallenge.Client{APIHost: parker.URL, HTTP: parker.Client()},
				TokenCache: cache,
				Sleep:      func(context.Context, time.Duration) error { return nil },
			},
			Interactive: func() bool { return true },
		})},
	})
	req, _ := http.NewRequest("POST", gqlSrv.URL+"/graphql", strings.NewReader(mutationBody))
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)

	got := stderr.String()
	for _, want := range []string{
		"updateDefensiveModeStatus",    // which operation
		"503",                          // what the step-up service said
		"step-up provider unavailable", // why
	} {
		if !strings.Contains(got, want) {
			t.Errorf("step-up failure notice must mention %q; got %q", want, got)
		}
	}
	// The original GraphQL error still has to reach the error middleware.
	if !strings.Contains(string(body), "elevated-permission-required") {
		t.Errorf("original error must still be surfaced; body = %s", body)
	}
}

// TestRechallengeFailureReasonCannotLeakToken: the surfaced text is
// server-controlled and reaches CI logs and the telemetry exit hook. Parker
// echoes request context into some payloads, so the worst case is the response
// body containing the caller's own bearer token.
func TestRechallengeFailureReasonCannotLeakToken(t *testing.T) {
	const bearer = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyaW5hdCJ9.c2lnbmF0dXJlLWhlcmU"
	parker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		w.Write([]byte(`{"error":"upstream refused","request":{"authorization":"` +
			r.Header.Get("Authorization") + `"}}`))
	}))
	defer parker.Close()
	gqlSrv := elevatedBouncer(t, parker.URL, nil)

	var stderr strings.Builder
	cache := newTestRechallengeCache()
	c := NewClient(Config{
		APIHost: gqlSrv.URL, TestMode: true,
		Middleware: []Middleware{NewRechallengeMiddleware(RechallengeConfig{
			TokenCache: cache,
			Stderr:     &stderr,
			Runner: &rechallenge.Runner{
				Client: &rechallenge.Client{
					APIHost: parker.URL, HTTP: parker.Client(), BearerToken: bearer,
				},
				TokenCache: cache,
				Sleep:      func(context.Context, time.Duration) error { return nil },
			},
			Interactive: func() bool { return true },
		})},
	})
	req, _ := http.NewRequest("POST", gqlSrv.URL+"/graphql", strings.NewReader(mutationBody))
	if _, err := c.Do(req); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if strings.Contains(stderr.String(), bearer) {
		t.Fatalf("bearer token leaked into the surfaced step-up failure: %s", stderr.String())
	}
	if !strings.Contains(stderr.String(), "upstream refused") {
		t.Errorf("redaction must not eat the diagnosis; got %q", stderr.String())
	}
}

// TestRechallengeNonInteractiveReturnsPromptly is the middleware-level watchdog
// for the CI hang: a mutation that trips step-up under --non-interactive must
// come back with an error immediately instead of polling Parker until the
// verification session expires. It FAILS on timeout rather than hanging, so a
// regression shows up as a red build and not as a stuck job.
func TestRechallengeNonInteractiveReturnsPromptly(t *testing.T) {
	var parkerHits int32
	parkerMux := http.NewServeMux()
	hour := time.Now().Add(time.Hour).Format(time.RFC3339)
	parkerMux.HandleFunc("/x", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&parkerHits, 1)
		w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v","pollIntervalSeconds":0,"expiresAt":"` + hour + `"}`))
	})
	parkerMux.HandleFunc("/x/c1", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&parkerHits, 1)
		w.Write([]byte(`{"challengeId":"c1","status":"pending","expiresAt":"` + hour + `","pollIntervalSeconds":0}`))
	})
	parker := httptest.NewServer(parkerMux)
	defer parker.Close()
	gqlSrv := elevatedBouncer(t, parker.URL, nil)

	var stderr strings.Builder
	cache := newTestRechallengeCache()
	c := NewClient(Config{
		APIHost: gqlSrv.URL, TestMode: true,
		Middleware: []Middleware{NewRechallengeMiddleware(RechallengeConfig{
			TokenCache: cache,
			Stderr:     &stderr,
			Runner: &rechallenge.Runner{
				Client:     &rechallenge.Client{APIHost: parker.URL, HTTP: parker.Client()},
				TokenCache: cache,
				Sleep: func(ctx context.Context, _ time.Duration) error {
					select {
					case <-ctx.Done():
						return ctx.Err()
					case <-time.After(10 * time.Millisecond):
						return nil
					}
				},
			},
			Interactive: func() bool { return false },
			Wait:        func() bool { return false },
		})},
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "POST", gqlSrv.URL+"/graphql", strings.NewReader(mutationBody))

	done := make(chan error, 1)
	go func() {
		_, err := c.Do(req)
		done <- err
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Do: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("mutation did not return within 5s under --non-interactive: " +
			"step-up is polling a challenge nobody can approve (this is the CI hang)")
	}

	if n := atomic.LoadInt32(&parkerHits); n != 0 {
		t.Errorf("Parker was called %d times; a non-interactive run must not open a "+
			"verification session no human can complete", n)
	}
	if !strings.Contains(stderr.String(), "non-interactive") {
		t.Errorf("user must be told why step-up was refused; stderr = %q", stderr.String())
	}
}

func TestRechallengeIgnoresUnrelatedErrors(t *testing.T) {
	calls := int32(0)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Write([]byte(`{"errors":[{"message":"validation failed","extensions":{"code":"BAD_REQUEST"}}]}`))
	}))
	defer srv.Close()
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewRechallengeMiddleware(RechallengeConfig{
			TokenCache: newTestRechallengeCache(),
		})},
	})
	body := `{"operationName":"U","query":"mutation U{updateDefensiveModeStatus(input:{}){success}}"}`
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(body))
	if _, err := c.Do(req); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if calls != 1 {
		t.Errorf("calls = %d, want 1 (no rechallenge for unrelated errors)", calls)
	}
}

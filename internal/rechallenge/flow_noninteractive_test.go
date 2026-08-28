package rechallenge

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// pendingForeverServer answers createSession with a session that never leaves
// "pending" and does not expire for an hour. Any flow that decides to poll it
// runs until the watchdog fires, which is exactly the CI hang under test.
func pendingForeverServer(t *testing.T, sessionsCreated *int32) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	hour := func() string { return time.Now().Add(time.Hour).Format(time.RFC3339) }
	mux.HandleFunc("/p/sessions", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(sessionsCreated, 1)
		w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v/c1","pollIntervalSeconds":0,"expiresAt":"` + hour() + `"}`))
	})
	mux.HandleFunc("/p/sessions/c1", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"pending","expiresAt":"` + hour() + `","pollIntervalSeconds":0}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func testExtension(base string) Extension {
	return Extension{
		Version:              Version,
		CreateSessionPath:    "/p/sessions",
		StatusPathTemplate:   base + "/p/sessions/{challengeId}",
		ExchangePathTemplate: base + "/p/sessions/{challengeId}/exchange",
		ElevatedHeaderName:   "x-elevated-token",
	}
}

// runAsync runs the flow on a goroutine and returns a channel carrying the
// result. The caller MUST select against a watchdog: a regression here is an
// infinite poll loop, and a plain synchronous call would express it as a stuck
// CI job instead of a red build.
func runAsync(ctx context.Context, r *Runner, in RunInput) <-chan error {
	done := make(chan error, 1)
	go func() { _, err := r.Run(ctx, in); done <- err }()
	return done
}

// TestFlowNonInteractiveFailsFastInsteadOfPolling pins the CI-hang fix.
//
// Before: a step-up challenge raised in a --non-interactive session created a
// verification session and polled it until the session expired — nobody can
// approve a browser challenge in CI, so the command blocked for the whole
// session window and only then failed. After: it fails immediately, and never
// creates the unapprovable session in the first place.
//
// Node parity: src/lib/rechallenge/flow.ts:56 (`if (!interactive && !wait)`).
func TestFlowNonInteractiveFailsFastInsteadOfPolling(t *testing.T) {
	var sessionsCreated int32
	srv := pendingForeverServer(t, &sessionsCreated)

	// Cancellable so a REGRESSION stops polling when the watchdog fires
	// instead of leaking a hot goroutine into the rest of the package's tests.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tr := &fakeTracker{}
	r := &Runner{
		Client:     &Client{APIHost: srv.URL, HTTP: srv.Client()},
		Tracker:    tr,
		TokenCache: newTestCache(),
		Stdout:     io.Discard,
		Sleep: func(ctx context.Context, _ time.Duration) error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(10 * time.Millisecond):
				return nil
			}
		},
	}

	done := runAsync(ctx, r, RunInput{
		RequestedOperation: "updateDefensiveModeStatus",
		Interactive:        false,
		Extension:          testExtension(srv.URL),
	})

	select {
	case err := <-done:
		var ire *InteractionRequiredError
		if !errors.As(err, &ire) {
			t.Fatalf("err = %T (%v), want *InteractionRequiredError", err, err)
		}
		// The message has to say what happened AND what to do about it —
		// a bare "permission denied" is what sent people spelunking.
		for _, want := range []string{
			"updateDefensiveModeStatus",
			"non-interactive",
			"VIP_RECHALLENGE_WAIT=1",
		} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("error text must mention %q; got %q", want, err.Error())
			}
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return within 5s in a non-interactive session: " +
			"step-up is polling a challenge nobody can approve (this is the CI hang)")
	}

	if n := atomic.LoadInt32(&sessionsCreated); n != 0 {
		t.Errorf("createSession called %d times; a non-interactive session must not "+
			"mint a verification challenge no human can complete", n)
	}
	if !containsString(tr.events, "rechallenge_interaction_required") {
		t.Errorf("missing rechallenge_interaction_required event; got %v", tr.events)
	}
}

// TestFlowNonInteractiveWaitOptInStillPolls: the fail-fast must stay opt-out-able.
// An operator running headless who can approve on a phone sets
// VIP_RECHALLENGE_WAIT=1 (Node: --rechallenge-wait) and gets the old behavior.
func TestFlowNonInteractiveWaitOptInStillPolls(t *testing.T) {
	mux := http.NewServeMux()
	hour := func() string { return time.Now().Add(time.Hour).Format(time.RFC3339) }
	mux.HandleFunc("/p/sessions", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v/c1","pollIntervalSeconds":0,"expiresAt":"` + hour() + `"}`))
	})
	mux.HandleFunc("/p/sessions/c1", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"verified","expiresAt":"` + hour() + `","pollIntervalSeconds":0,"provider":"passkeys"}`))
	})
	mux.HandleFunc("/p/sessions/c1/exchange", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"elevatedToken":{"token":"opaque","expiresAt":"` + time.Now().Add(2*time.Hour).Format(time.RFC3339) + `","purpose":"x"}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	var out strings.Builder
	r := &Runner{
		Client:     &Client{APIHost: srv.URL, HTTP: srv.Client()},
		Tracker:    &fakeTracker{},
		TokenCache: newTestCache(),
		Stdout:     &out,
		Sleep:      func(context.Context, time.Duration) error { return nil },
	}
	tok, err := r.Run(context.Background(), RunInput{
		RequestedOperation: "updateDefensiveModeStatus",
		Interactive:        false,
		Wait:               true,
		Extension:          testExtension(srv.URL),
	})
	if err != nil {
		t.Fatalf("Run with Wait opt-in: %v", err)
	}
	if tok == nil || tok.Token != "opaque" {
		t.Fatalf("token = %+v, want opaque", tok)
	}
	if !strings.Contains(out.String(), "https://example/v/c1") {
		t.Errorf("waiting non-interactive run must print the verification URL; got %q", out.String())
	}
}

// TestFlowRejectsUnusableDeadline: a session with no (or unparseable) expiresAt
// used to disable the deadline check entirely — `!deadline.IsZero()` meant the
// loop polled forever with nothing to stop it. Node throws immediately
// (flow.ts:93). Watchdogged for the same reason as above.
func TestFlowRejectsUnusableDeadline(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/p/sessions", func(w http.ResponseWriter, r *http.Request) {
		// No expiresAt at all -> zero time.
		w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v/c1","pollIntervalSeconds":0}`))
	})
	mux.HandleFunc("/p/sessions/c1", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"challengeId":"c1","status":"pending","pollIntervalSeconds":0}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	r := &Runner{
		Client:     &Client{APIHost: srv.URL, HTTP: srv.Client()},
		Tracker:    &fakeTracker{},
		TokenCache: newTestCache(),
		Stdout:     io.Discard,
		Sleep: func(ctx context.Context, _ time.Duration) error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(10 * time.Millisecond):
				return nil
			}
		},
	}
	done := runAsync(ctx, r, RunInput{
		RequestedOperation: "updateDefensiveModeStatus",
		Interactive:        true,
		Extension:          testExtension(srv.URL),
	})

	select {
	case err := <-done:
		var terr *TerminalError
		if !errors.As(err, &terr) {
			t.Fatalf("err = %T (%v), want *TerminalError", err, err)
		}
		if terr.Status() != StatusExpired {
			t.Errorf("status = %q, want %q", terr.Status(), StatusExpired)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return within 5s for a session with no expiresAt: " +
			"the poll loop has no deadline and will never stop")
	}
}

// TestFlowFloorsServerPollInterval: pollIntervalSeconds of 0 (or absent, or
// negative) used to produce a zero sleep, i.e. an unthrottled status-poll loop
// against Parker for the life of the session. Node clamps to 2s
// (flow.ts:24 MIN_POLL_INTERVAL_SECONDS).
func TestFlowFloorsServerPollInterval(t *testing.T) {
	for _, tc := range []struct {
		name string
		body string
	}{
		{"zero", `"pollIntervalSeconds":0,`},
		{"absent", ``},
		{"negative", `"pollIntervalSeconds":-5,`},
		{"below floor", `"pollIntervalSeconds":1,`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			hour := time.Now().Add(time.Hour).Format(time.RFC3339)
			mux := http.NewServeMux()
			mux.HandleFunc("/p/sessions", func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(`{"challengeId":"c1","status":"pending","verificationUrl":"https://example/v",` + tc.body + `"expiresAt":"` + hour + `"}`))
			})
			mux.HandleFunc("/p/sessions/c1", func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(`{"challengeId":"c1","status":"verified","expiresAt":"` + hour + `","pollIntervalSeconds":0,"provider":"p"}`))
			})
			mux.HandleFunc("/p/sessions/c1/exchange", func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(`{"elevatedToken":{"token":"t","expiresAt":"` + hour + `","purpose":"x"}}`))
			})
			srv := httptest.NewServer(mux)
			defer srv.Close()

			var mu sync.Mutex
			var slept []time.Duration
			r := &Runner{
				Client:     &Client{APIHost: srv.URL, HTTP: srv.Client()},
				Tracker:    &fakeTracker{},
				TokenCache: newTestCache(),
				Stdout:     io.Discard,
				Sleep: func(_ context.Context, d time.Duration) error {
					mu.Lock()
					slept = append(slept, d)
					mu.Unlock()
					return nil
				},
			}
			if _, err := r.Run(context.Background(), RunInput{
				RequestedOperation: "op",
				Interactive:        true,
				Extension:          testExtension(srv.URL),
			}); err != nil {
				t.Fatalf("Run: %v", err)
			}
			mu.Lock()
			defer mu.Unlock()
			if len(slept) == 0 {
				t.Fatal("poll loop never slept")
			}
			for _, d := range slept {
				if d < MinPollInterval {
					t.Errorf("slept %v, want >= %v (unthrottled polling hammers Parker)", d, MinPollInterval)
				}
			}
		})
	}
}

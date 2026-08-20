package phpmyadmin

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Khan/genqlient/graphql"
)

// fakeServer dispatches on the GraphQL operationName in the request body.
// Each handler can be set per test; nil handlers default to a generic 200
// with `{"data":null}` which would tell us via assertion that the test
// forgot to wire that op.
type fakeServer struct {
	enable   func(w http.ResponseWriter, r *http.Request)
	status   func(w http.ResponseWriter, r *http.Request)
	generate func(w http.ResponseWriter, r *http.Request)

	enableHits   int32
	statusHits   int32
	generateHits int32
}

func (f *fakeServer) serve(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	w.Header().Set("Content-Type", "application/json")
	s := string(body)
	switch {
	case strings.Contains(s, `"operationName":"EnablePhpMyAdmin"`):
		atomic.AddInt32(&f.enableHits, 1)
		if f.enable != nil {
			f.enable(w, r)
			return
		}
	case strings.Contains(s, `"operationName":"PhpMyAdminStatus"`):
		atomic.AddInt32(&f.statusHits, 1)
		if f.status != nil {
			f.status(w, r)
			return
		}
	case strings.Contains(s, `"operationName":"GeneratePhpMyAdminAccess"`):
		atomic.AddInt32(&f.generateHits, 1)
		if f.generate != nil {
			f.generate(w, r)
			return
		}
	}
	// Default: respond with an empty data payload so unhandled ops fail
	// downstream assertion rather than hang.
	_, _ = w.Write([]byte(`{"data":null}`))
}

func newClient(t *testing.T, srv *httptest.Server) graphql.Client {
	t.Helper()
	return graphql.NewClient(srv.URL, srv.Client())
}

// TestRunHappyPath: status is already "running", so Node's
// maybeEnablePhpMyAdmin (phpmyadmin.ts:213-222) short-circuits — NO enable
// mutation, NO poll loop, NO post-enable wait — and we go straight to
// generate.
//
//	const status = await this.getStatus();
//	if ( ! [ 'running', 'enabled' ].includes( status ) ) { … }
//
// Go used to fire the enable mutation unconditionally on every invocation.
func TestRunHappyPath(t *testing.T) {
	fs := &fakeServer{
		enable: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"enablePHPMyAdmin":{"success":true}}}`))
		},
		status: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"running"}}]}}}`))
		},
		generate: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"generatePHPMyAdminAccess":{"url":"https://pma.example/abc"}}}`))
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(fs.serve))
	defer srv.Close()

	waits := 0
	var stderr bytes.Buffer
	res, err := Run(context.Background(), newClient(t, srv), 1, 2, RunOpts{
		Stderr:         &stderr,
		PollInterval:   1 * time.Millisecond,
		PollTimeout:    1 * time.Second,
		PostEnableWait: time.Hour, // would hang the test if it were honoured
		sleep:          func(time.Duration) { waits++ },
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.URL != "https://pma.example/abc" {
		t.Errorf("URL = %q, want https://pma.example/abc", res.URL)
	}
	if fs.enableHits != 0 {
		t.Errorf("enable hits = %d, want 0: phpMyAdmin is already running", fs.enableHits)
	}
	if fs.statusHits != 1 || fs.generateHits != 1 {
		t.Errorf("status/generate hits = %d/%d, want 1/1", fs.statusHits, fs.generateHits)
	}
	if waits != 0 {
		t.Errorf("post-enable wait ran %d times, want 0 (nothing was enabled)", waits)
	}
	// Progress lines must hit stderr by default.
	if !strings.Contains(stderr.String(), "phpMyAdmin") {
		t.Errorf("stderr missing progress; got=%q", stderr.String())
	}
}

// TestRunSkipsEnableWhenStatusIsEnabled: "enabled" is the second value in
// Node's short-circuit list, and it skips the poll loop too — an env that
// reports "enabled" (never "running") must NOT wedge for 6 hours.
func TestRunSkipsEnableWhenStatusIsEnabled(t *testing.T) {
	fs := &fakeServer{
		status: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"enabled"}}]}}}`))
		},
		generate: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"generatePHPMyAdminAccess":{"url":"https://pma.example/en"}}}`))
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(fs.serve))
	defer srv.Close()

	done := make(chan error, 1)
	go func() {
		_, err := Run(context.Background(), newClient(t, srv), 1, 2, RunOpts{
			Stderr:         io.Discard,
			PollInterval:   1 * time.Millisecond,
			PollTimeout:    1 * time.Second,
			PostEnableWait: 0,
			sleep:          func(time.Duration) {},
		})
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run never returned on an 'enabled' environment")
	}
	if fs.enableHits != 0 {
		t.Errorf("enable hits = %d, want 0 for status 'enabled'", fs.enableHits)
	}
	if fs.statusHits != 1 {
		t.Errorf("status hits = %d, want 1: 'enabled' must not enter the poll loop", fs.statusHits)
	}
}

// TestRunWaitsForLoadBalancerAfterEnabling ports the last line of
// maybeEnablePhpMyAdmin: `await setTimeout( 30_000 )` — "Additional 30s for
// LB routing to be updated" (phpmyadmin.ts:219-220). It runs ONLY on the
// branch that actually enabled.
func TestRunWaitsForLoadBalancerAfterEnabling(t *testing.T) {
	statusCalls := int32(0)
	fs := &fakeServer{
		enable: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"enablePHPMyAdmin":{"success":true}}}`))
		},
		status: func(w http.ResponseWriter, _ *http.Request) {
			if atomic.AddInt32(&statusCalls, 1) == 1 {
				_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"stopped"}}]}}}`))
				return
			}
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"running"}}]}}}`))
		},
		generate: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"generatePHPMyAdminAccess":{"url":"https://pma.example/lb"}}}`))
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(fs.serve))
	defer srv.Close()

	var slept []time.Duration
	_, err := Run(context.Background(), newClient(t, srv), 1, 2, RunOpts{
		Stderr:       io.Discard,
		PollInterval: 1 * time.Millisecond,
		PollTimeout:  1 * time.Second,
		sleep:        func(d time.Duration) { slept = append(slept, d) },
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if fs.enableHits != 1 {
		t.Errorf("enable hits = %d, want 1 (status was 'stopped')", fs.enableHits)
	}
	if len(slept) != 1 || slept[0] != DefaultPostEnableWait {
		t.Errorf("post-enable waits = %v, want [%v]", slept, DefaultPostEnableWait)
	}
}

// TestDefaultPollTimeoutIsNodesSixHourCeiling: Node's poll here inherits the
// pollUntil default (phpmyadmin.ts:217 passes no timeout), so the ceiling is
// 6 hours. Go capped it at 60 seconds, aborting slow-but-healthy enables.
func TestDefaultPollTimeoutIsNodesSixHourCeiling(t *testing.T) {
	if DefaultPollTimeout != 6*time.Hour {
		t.Errorf("DefaultPollTimeout = %v, want 6h", DefaultPollTimeout)
	}
	if DefaultPollInterval != time.Second {
		t.Errorf("DefaultPollInterval = %v, want 1s (phpmyadmin.ts:217)", DefaultPollInterval)
	}
	if DefaultPostEnableWait != 30*time.Second {
		t.Errorf("DefaultPostEnableWait = %v, want 30s (phpmyadmin.ts:220)", DefaultPostEnableWait)
	}
}

// TestRunUsesDefaultCeilingWhenUnset closes the gap between "the constant is
// 6h" and "the loop actually runs with 6h": Run resolves a zero PollTimeout
// through resolveRunOpts, which is the value the poll loop is handed.
func TestRunUsesDefaultCeilingWhenUnset(t *testing.T) {
	got := resolveRunOpts(RunOpts{})
	if got.PollTimeout != DefaultPollTimeout {
		t.Errorf("resolved PollTimeout = %v, want %v", got.PollTimeout, DefaultPollTimeout)
	}
	if got.PollInterval != DefaultPollInterval {
		t.Errorf("resolved PollInterval = %v, want %v", got.PollInterval, DefaultPollInterval)
	}
	if got.PostEnableWait != DefaultPostEnableWait {
		t.Errorf("resolved PostEnableWait = %v, want %v", got.PostEnableWait, DefaultPostEnableWait)
	}
	// Explicit values survive resolution (that is what makes the ceiling
	// testable without a six-hour test).
	explicit := resolveRunOpts(RunOpts{PollTimeout: time.Minute, PollInterval: time.Second, PostEnableWait: -1})
	if explicit.PollTimeout != time.Minute {
		t.Errorf("explicit PollTimeout was overwritten: %v", explicit.PollTimeout)
	}
	if explicit.PostEnableWait != -1 {
		t.Errorf("explicit PostEnableWait was overwritten: %v", explicit.PostEnableWait)
	}
}

// TestRunPolling: first status "pending" then "running" — must complete
// after one poll iteration.
func TestRunPolling(t *testing.T) {
	statusCalls := int32(0)
	fs := &fakeServer{
		enable: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"enablePHPMyAdmin":{"success":true}}}`))
		},
		status: func(w http.ResponseWriter, _ *http.Request) {
			n := atomic.AddInt32(&statusCalls, 1)
			if n == 1 {
				_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"pending"}}]}}}`))
				return
			}
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"running"}}]}}}`))
		},
		generate: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"generatePHPMyAdminAccess":{"url":"https://pma.example/xyz"}}}`))
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(fs.serve))
	defer srv.Close()

	res, err := Run(context.Background(), newClient(t, srv), 1, 2, RunOpts{
		Stderr:       io.Discard,
		PollInterval: 1 * time.Millisecond,
		PollTimeout:  1 * time.Second,
		sleep:        func(time.Duration) {},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.URL != "https://pma.example/xyz" {
		t.Errorf("URL = %q, want https://pma.example/xyz", res.URL)
	}
	if statusCalls < 2 {
		t.Errorf("status calls = %d, want >= 2 (polling kicked in)", statusCalls)
	}
}

// TestRunSilentSuppressesStderr confirms Silent skips the progress lines.
func TestRunSilentSuppressesStderr(t *testing.T) {
	fs := &fakeServer{
		enable: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"enablePHPMyAdmin":{"success":true}}}`))
		},
		status: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"running"}}]}}}`))
		},
		generate: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"generatePHPMyAdminAccess":{"url":"https://pma.example/q"}}}`))
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(fs.serve))
	defer srv.Close()

	var stderr bytes.Buffer
	_, err := Run(context.Background(), newClient(t, srv), 1, 2, RunOpts{
		Silent:       true,
		Stderr:       &stderr,
		PollInterval: 1 * time.Millisecond,
		PollTimeout:  1 * time.Second,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if stderr.Len() != 0 {
		t.Errorf("silent mode wrote to stderr: %q", stderr.String())
	}
}

// TestRunEnableUnauthorized maps the backend detail to Node's actionable
// permission message while preserving a non-zero result.
func TestRunEnableUnauthorized(t *testing.T) {
	fs := &fakeServer{
		enable: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"errors":[{"message":"Unauthorized"}],"data":null}`))
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(fs.serve))
	defer srv.Close()

	_, err := Run(context.Background(), newClient(t, srv), 1, 2, RunOpts{
		Stderr:       io.Discard,
		PollInterval: 1 * time.Millisecond,
		PollTimeout:  100 * time.Millisecond,
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	const want = "You do not have sufficient permission to access phpMyAdmin for this environment."
	if err.Error() != want {
		t.Errorf("error = %q, want %q", err.Error(), want)
	}
}

func TestRunEnableFailureUsesStableSupportMessage(t *testing.T) {
	fs := &fakeServer{
		enable: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"errors":[{"message":"backend exploded"}],"data":null}`))
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(fs.serve))
	defer srv.Close()

	_, err := Run(context.Background(), newClient(t, srv), 1, 2, RunOpts{
		Stderr:       io.Discard,
		PollInterval: 1 * time.Millisecond,
		PollTimeout:  100 * time.Millisecond,
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	const want = "Failed to enable phpMyAdmin. Please try again. If the problem persists, please contact support."
	if err.Error() != want {
		t.Errorf("error = %q, want %q", err.Error(), want)
	}
}

// TestRunPollTimeout: status never reaches "running" — must error after
// PollTimeout elapses.
func TestRunPollTimeout(t *testing.T) {
	fs := &fakeServer{
		enable: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"enablePHPMyAdmin":{"success":true}}}`))
		},
		status: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"pending"}}]}}}`))
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(fs.serve))
	defer srv.Close()

	_, err := Run(context.Background(), newClient(t, srv), 1, 2, RunOpts{
		Stderr:       io.Discard,
		PollInterval: 1 * time.Millisecond,
		PollTimeout:  20 * time.Millisecond,
	})
	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}
	const want = "Failed to enable phpMyAdmin. Please try again. If the problem persists, please contact support."
	if err.Error() != want {
		t.Errorf("error = %q, want %q", err.Error(), want)
	}
}

// TestRunGenerateFailure: enable+poll succeed but generate errors —
// surface as error.
func TestRunGenerateFailure(t *testing.T) {
	fs := &fakeServer{
		enable: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"enablePHPMyAdmin":{"success":true}}}`))
		},
		status: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"running"}}]}}}`))
		},
		generate: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"errors":[{"message":"boom"}],"data":null}`))
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(fs.serve))
	defer srv.Close()

	_, err := Run(context.Background(), newClient(t, srv), 1, 2, RunOpts{
		Stderr:       io.Discard,
		PollInterval: 1 * time.Millisecond,
		PollTimeout:  1 * time.Second,
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.HasPrefix(err.Error(), "Failed to generate phpMyAdmin URL: ") {
		t.Errorf("error doesn't use the stable URL-generation prefix: %v", err)
	}
}

package commands

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/phpmyadmin"
)

// phpmyadminStubServer dispatches on operationName so a single test stub can
// answer all three ops in the enable + poll + generate flow.
type phpmyadminStubServer struct {
	enableBody   []byte
	statusBody   []byte
	generateBody []byte
	enableHits   int32
	statusHits   int32
	generateHits int32
}

func (s *phpmyadminStubServer) handler(t *testing.T) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		ops := string(body)
		switch {
		case strings.Contains(ops, `"operationName":"EnablePhpMyAdmin"`):
			atomic.AddInt32(&s.enableHits, 1)
			_, _ = w.Write(s.enableBody)
		case strings.Contains(ops, `"operationName":"PhpMyAdminStatus"`):
			atomic.AddInt32(&s.statusHits, 1)
			_, _ = w.Write(s.statusBody)
		case strings.Contains(ops, `"operationName":"GeneratePhpMyAdminAccess"`):
			atomic.AddInt32(&s.generateHits, 1)
			_, _ = w.Write(s.generateBody)
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	})
}

// setupPhpmyadminConfig swaps the openURLFn seam in addition to wiring the
// genqlient client, so the default (non --print) branch doesn't actually
// launch a browser. Returns a cleanup func that restores both.
func setupPhpmyadminConfig(srv *httptest.Server, opened *string) func() {
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	prevCfg := GetConfig()
	SetConfig(Config{GQLClient: c})
	prevOpen := openURLFn
	openURLFn = func(url string) error {
		if opened != nil {
			*opened = url
		}
		return nil
	}
	return func() {
		SetConfig(prevCfg)
		openURLFn = prevOpen
	}
}

func successStub() *phpmyadminStubServer {
	return &phpmyadminStubServer{
		enableBody:   []byte(`{"data":{"enablePHPMyAdmin":{"success":true}}}`),
		statusBody:   []byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"running"}}]}}}`),
		generateBody: []byte(`{"data":{"generatePHPMyAdminAccess":{"url":"https://pma.example/abc"}}}`),
	}
}

func TestDBPhpmyadminPrintWritesURLToStdout(t *testing.T) {
	stub := successStub()
	srv := httptest.NewServer(stub.handler(t))
	defer srv.Close()
	var opened string
	cleanup := setupPhpmyadminConfig(srv, &opened)
	defer cleanup()

	cmd := DBPhpmyadminCmd()
	_ = cmd.Flags().Set("print", "true")
	var stdout, stderr bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stderr)
	cmd.SetContext(ctxWithAppEnv(1, 2))

	if err := runDBPhpmyadmin(cmd, nil); err != nil {
		t.Fatalf("runDBPhpmyadmin: %v", err)
	}
	if strings.TrimSpace(stdout.String()) != "https://pma.example/abc" {
		t.Errorf("stdout = %q, want URL", stdout.String())
	}
	if opened != "" {
		t.Errorf("--print must not open browser; got %q", opened)
	}
}

func TestDBPhpmyadminPrintSilentSuppressesStderr(t *testing.T) {
	stub := successStub()
	srv := httptest.NewServer(stub.handler(t))
	defer srv.Close()
	cleanup := setupPhpmyadminConfig(srv, nil)
	defer cleanup()

	cmd := DBPhpmyadminCmd()
	_ = cmd.Flags().Set("print", "true")
	_ = cmd.Flags().Set("silent", "true")
	var stdout, stderr bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stderr)
	cmd.SetContext(ctxWithAppEnv(1, 2))

	if err := runDBPhpmyadmin(cmd, nil); err != nil {
		t.Fatalf("runDBPhpmyadmin: %v", err)
	}
	if strings.TrimSpace(stdout.String()) != "https://pma.example/abc" {
		t.Errorf("stdout = %q, want URL even when silent", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Errorf("--silent must suppress stderr; got %q", stderr.String())
	}
}

func TestDBPhpmyadminDefaultOpensBrowser(t *testing.T) {
	stub := successStub()
	srv := httptest.NewServer(stub.handler(t))
	defer srv.Close()
	var opened string
	cleanup := setupPhpmyadminConfig(srv, &opened)
	defer cleanup()

	cmd := DBPhpmyadminCmd()
	var stdout, stderr bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stderr)
	cmd.SetContext(ctxWithAppEnv(1, 2))

	if err := runDBPhpmyadmin(cmd, nil); err != nil {
		t.Fatalf("runDBPhpmyadmin: %v", err)
	}
	if opened != "https://pma.example/abc" {
		t.Errorf("openURLFn called with %q, want URL", opened)
	}
	if stdout.Len() != 0 {
		t.Errorf("default mode must not write to stdout; got %q", stdout.String())
	}
	if !strings.Contains(stderr.String(), "phpMyAdmin is opened in your default browser") {
		t.Errorf("default mode missing 'opened in your default browser' line; stderr=%q", stderr.String())
	}
}

// TestDBPhpmyadminAlreadyRunningSkipsEnableMutation is the command-level
// regression test for the extra enable mutation: `vip db phpmyadmin` used to
// fire EnablePhpMyAdmin on EVERY invocation, even against an environment
// whose phpMyAdmin was already running (phpmyadmin.ts:214-215 checks first).
func TestDBPhpmyadminAlreadyRunningSkipsEnableMutation(t *testing.T) {
	stub := successStub()
	srv := httptest.NewServer(stub.handler(t))
	defer srv.Close()
	cleanup := setupPhpmyadminConfig(srv, nil)
	defer cleanup()

	cmd := DBPhpmyadminCmd()
	_ = cmd.Flags().Set("print", "true")
	var stdout, stderr bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stderr)
	cmd.SetContext(ctxWithAppEnv(1, 2))

	if err := runDBPhpmyadmin(cmd, nil); err != nil {
		t.Fatalf("runDBPhpmyadmin: %v", err)
	}
	if stub.enableHits != 0 {
		t.Errorf("EnablePhpMyAdmin fired %d times against a running environment, want 0",
			stub.enableHits)
	}
}

// TestPhpmyadminPollTimeoutKnob: the ceiling defaults to Node's 6h (NOT the
// 60s Go used to hard-code) and is overridable through the same
// VIP_*_MS knob shape as VIP_BACKUP_DB_INTERVAL_MS / VIP_EXPORT_SQL_INTERVAL_MS,
// so the ceiling is exercisable in a test without a six-hour wait.
func TestPhpmyadminPollTimeoutKnob(t *testing.T) {
	if got := phpmyadminPollTimeout(); got != phpmyadmin.DefaultPollTimeout {
		t.Errorf("phpmyadminPollTimeout() = %v, want %v", got, phpmyadmin.DefaultPollTimeout)
	}
	t.Setenv("VIP_PHPMYADMIN_TIMEOUT_MS", "25")
	if got := phpmyadminPollTimeout(); got != 25*time.Millisecond {
		t.Errorf("with knob set: %v, want 25ms", got)
	}

	if got := phpmyadminPollInterval(); got != phpmyadmin.DefaultPollInterval {
		t.Errorf("phpmyadminPollInterval() = %v, want %v", got, phpmyadmin.DefaultPollInterval)
	}
	t.Setenv("VIP_PHPMYADMIN_INTERVAL_MS", "3")
	if got := phpmyadminPollInterval(); got != 3*time.Millisecond {
		t.Errorf("with knob set: %v, want 3ms", got)
	}

	if got := phpmyadminPostEnableWait(); got != phpmyadmin.DefaultPostEnableWait {
		t.Errorf("phpmyadminPostEnableWait() = %v, want %v", got, phpmyadmin.DefaultPostEnableWait)
	}
	t.Setenv("VIP_PHPMYADMIN_POST_ENABLE_WAIT_MS", "0")
	if got := phpmyadminPostEnableWait(); got >= 0 {
		t.Errorf("with knob set to 0: %v, want a negative value (skip the wait)", got)
	}
}

// TestDBPhpmyadminStopsAtPollCeiling drives the whole command against an
// environment that never reports "running": with the ceiling knob turned
// down the command must fail instead of polling forever.
func TestDBPhpmyadminStopsAtPollCeiling(t *testing.T) {
	t.Setenv("VIP_PHPMYADMIN_INTERVAL_MS", "1")
	t.Setenv("VIP_PHPMYADMIN_TIMEOUT_MS", "30")
	t.Setenv("VIP_PHPMYADMIN_POST_ENABLE_WAIT_MS", "0")
	stub := &phpmyadminStubServer{
		enableBody:   []byte(`{"data":{"enablePHPMyAdmin":{"success":true}}}`),
		statusBody:   []byte(`{"data":{"app":{"environments":[{"phpMyAdminStatus":{"status":"pending"}}]}}}`),
		generateBody: []byte(`{"data":null}`),
	}
	srv := httptest.NewServer(stub.handler(t))
	defer srv.Close()
	cleanup := setupPhpmyadminConfig(srv, nil)
	defer cleanup()

	cmd := DBPhpmyadminCmd()
	_ = cmd.Flags().Set("print", "true")
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(ctxWithAppEnv(1, 2))

	done := make(chan error, 1)
	go func() { done <- runDBPhpmyadmin(cmd, nil) }()
	select {
	case err := <-done:
		const want = "Failed to enable phpMyAdmin. Please try again. If the problem persists, please contact support."
		if err == nil || err.Error() != want {
			t.Errorf("err = %v, want %q", err, want)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("runDBPhpmyadmin never returned")
	}
}

func TestDBPhpmyadminEnableUnauthorizedReturnsPermissionMessage(t *testing.T) {
	stub := &phpmyadminStubServer{
		enableBody:   []byte(`{"errors":[{"message":"Unauthorized"}],"data":null}`),
		statusBody:   []byte(`{"data":null}`),
		generateBody: []byte(`{"data":null}`),
	}
	srv := httptest.NewServer(stub.handler(t))
	defer srv.Close()
	cleanup := setupPhpmyadminConfig(srv, nil)
	defer cleanup()

	cmd := DBPhpmyadminCmd()
	_ = cmd.Flags().Set("print", "true")
	cmd.SetContext(ctxWithAppEnv(1, 2))

	err := runDBPhpmyadmin(cmd, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	const want = "You do not have sufficient permission to access phpMyAdmin for this environment."
	if err.Error() != want {
		t.Errorf("error = %q, want %q", err.Error(), want)
	}
}

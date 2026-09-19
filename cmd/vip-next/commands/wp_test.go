package commands

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/Khan/genqlient/graphql"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
)

// wpEnvInfoBody builds a minimal WPEnvInfo JSON response.
func wpEnvInfoBody(typeID int64) string {
	return `{"data":{"app":{"id":42,"name":"parityapp","typeId":` +
		strconv.FormatInt(typeID, 10) +
		`,"environments":[{"id":7,"appId":42,"type":"production","name":"production","wpcliStrategy":"ssh","primaryDomain":{"name":"example.com"}}]}}}`
}

// wpEnvInfoBodyWithStrategy builds a WPEnvInfo JSON response with a custom strategy and env type.
func wpEnvInfoBodyWithStrategy(typeID int64, strategy, envType string) string {
	return `{"data":{"app":{"id":42,"name":"parityapp","typeId":` +
		strconv.FormatInt(typeID, 10) +
		`,"environments":[{"id":7,"appId":42,"type":"` + envType + `","name":"` + envType + `","wpcliStrategy":"` + strategy + `","primaryDomain":{"name":"example.com"}}]}}}`
}

// wpStub serves WPEnvInfo and optionally TriggerWPCLICommand responses.
type wpStub struct {
	body        string
	triggerBody string // if empty, returns {"data":null}
	triggerHits atomic.Int32
}

func (s *wpStub) start(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bs := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(bs, `"operationName":"WPEnvInfo"`):
			_, _ = w.Write([]byte(s.body))
		case strings.Contains(bs, `"operationName":"TriggerWPCLICommand"`):
			s.triggerHits.Add(1)
			tb := s.triggerBody
			if tb == "" {
				tb = `{"data":null}`
			}
			_, _ = w.Write([]byte(tb))
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func setupWPTest(t *testing.T, stub *wpStub) {
	t.Helper()
	srv := stub.start(t)
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()), APIHost: srv.URL, Token: "tok"})
	t.Cleanup(func() { SetConfig(Config{}) })
	t.Setenv("NO_COLOR", "1")
}

// wpCtx builds a context with a pre-resolved AppEnv. The envType controls
// the production-confirm gate (ae.Env.Type), typeID is the app type for
// the appctx.App (not used by the Node.js gate which reads info.AppTypeID
// from WPEnvInfo, but populated for completeness).
func wpCtx(appID, envID, typeID int64, envType string) context.Context {
	return appctx.WithAppEnv(context.Background(), &appctx.AppEnv{
		App: appctx.App{ID: appID, Name: "parityapp", TypeId: typeID},
		Env: appctx.Env{ID: envID, Name: envType, Type: envType},
	})
}

// TestWPNodejsRejected: WPEnvInfo returns typeId:3 (Node.js site) →
// runWP must return the exact Node.js rejection error.
func TestWPNodejsRejected(t *testing.T) {
	stub := &wpStub{body: wpEnvInfoBody(3)}
	setupWPTest(t, stub)

	cmd := WPCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(wpCtx(42, 7, 3, "develop"))

	err := runWP(cmd, []string{"site", "list"})
	want := "WP-CLI commands are not supported on Node.js environments."
	if err == nil || err.Error() != want {
		t.Errorf("err = %v, want %q", err, want)
	}
}

// TestWPProductionConfirmDeclined: non-Node.js app, production env, no
// --yes, confirm stub declines → returns nil + "Command cancelled" on stdout.
func TestWPProductionConfirmDeclined(t *testing.T) {
	stub := &wpStub{body: wpEnvInfoBody(2)}
	setupWPTest(t, stub)
	defer SetWPYes(false) // ensure no state leak
	SetWPYes(false)

	restore := stubImportPrompts("", false) // confirm = false = decline
	defer restore()

	cmd := WPCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(wpCtx(42, 7, 2, "production"))

	err := runWP(cmd, []string{"user", "list"})
	if err != nil {
		t.Errorf("err = %v, want nil", err)
	}
	if !strings.Contains(stdout.String(), "Command cancelled") {
		t.Errorf("stdout = %q, want 'Command cancelled'", stdout.String())
	}
}

// TestWPProductionConfirmSkippedWithYes: non-Node.js app, production env,
// SetWPYes(true) skips the confirm gate entirely → runWP reaches the SSH
// dispatch and calls TriggerWPCLICommand. The stub returns nil data so the
// SSH auth check surfaces an error.
func TestWPProductionConfirmSkippedWithYes(t *testing.T) {
	stub := &wpStub{
		body:        wpEnvInfoBody(2),
		triggerBody: `{"data":{"triggerWPCLICommandOnAppEnvironment":null}}`,
	}
	setupWPTest(t, stub)
	SetWPYes(true)
	defer SetWPYes(false) // always reset

	cmd := WPCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(wpCtx(42, 7, 2, "production"))

	err := runWP(cmd, []string{"user", "list"})
	// The dispatch now reaches SSH path; TriggerWPCLICommand returns a null
	// payload, so we expect "WP-CLI SSH Authentication failed".
	if err == nil || !strings.Contains(err.Error(), "WP-CLI SSH Authentication failed") {
		t.Errorf("err = %v, want error containing 'WP-CLI SSH Authentication failed'", err)
	}
	if stub.triggerHits.Load() != 1 {
		t.Errorf("TriggerWPCLICommand hits = %d, want 1", stub.triggerHits.Load())
	}
}

// TestWPWebsocketStrategyDispatches: WPEnvInfo returns wpcliStrategy "websocket"
// → runWP must NO LONGER redirect to the Node CLI; it must reach the
// TriggerWPCLICommand mutation (WP2 socket.io path).
//
// We stub TriggerWPCLICommand to return a GraphQL error body. That proves we
// entered dispatchWPWebsocket without needing a live socket.io server.
// The key assertion: error does NOT contain "requires the Node CLI", and the
// trigger mutation DID fire.
func TestWPWebsocketStrategyDispatches(t *testing.T) {
	stub := &wpStub{
		body:        wpEnvInfoBodyWithStrategy(2, "websocket", "develop"),
		triggerBody: `{"data":null,"errors":[{"message":"unauthorized"}]}`,
	}
	setupWPTest(t, stub)
	SetWPYes(true) // skip production confirm; env is develop so irrelevant
	defer SetWPYes(false)

	cmd := WPCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(wpCtx(42, 7, 2, "develop"))

	err := runWP(cmd, []string{"site", "list"})
	// Must return a non-nil error (the GraphQL "unauthorized" error).
	if err == nil {
		t.Fatal("expected non-nil error from websocket dispatch path")
	}
	// Must NOT be the old redirect error.
	if strings.Contains(err.Error(), "requires the Node CLI") {
		t.Errorf("err = %v — still redirecting to Node CLI, websocket wiring not complete", err)
	}
	// The GraphQL error text must surface somewhere.
	combined := stdout.String() + err.Error()
	if !strings.Contains(combined, "unauthorized") {
		t.Errorf("expected 'unauthorized' in output+err, got stdout=%q err=%v", stdout.String(), err)
	}
	// TriggerWPCLICommand MUST have fired.
	if stub.triggerHits.Load() != 1 {
		t.Errorf("TriggerWPCLICommand hits = %d, want 1", stub.triggerHits.Load())
	}
}

// TestWPSSHTriggerError: SSH strategy, TriggerWPCLICommand returns a GraphQL
// error → runWP must return a non-nil error and stdout must contain the error
// message. Proves the SSH path reaches the mutation and surfaces errors
// without needing a live SSH server.
func TestWPSSHTriggerError(t *testing.T) {
	stub := &wpStub{
		body:        wpEnvInfoBodyWithStrategy(2, "ssh", "develop"),
		triggerBody: `{"data":null,"errors":[{"message":"command not allowed","locations":[],"path":null}]}`,
	}
	setupWPTest(t, stub)
	SetWPYes(true)
	defer SetWPYes(false)

	cmd := WPCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(wpCtx(42, 7, 2, "develop"))

	err := runWP(cmd, []string{"user", "list"})
	if err == nil {
		t.Fatal("expected non-nil error for GraphQL trigger error")
	}
	// The surfaced error message must contain the GraphQL error text.
	combined := stdout.String() + err.Error()
	if !strings.Contains(combined, "command not allowed") {
		t.Errorf("expected 'command not allowed' in output+err, got stdout=%q err=%v", stdout.String(), err)
	}
	if stub.triggerHits.Load() != 1 {
		t.Errorf("TriggerWPCLICommand hits = %d, want 1", stub.triggerHits.Load())
	}
}

// Node's production gate calls confirm([{key:'command', value:`wp ${cmd}`}],
// …) — it SHOWS the user the WP-CLI command that is about to run against
// production (src/bin/vip-wp.js:379-391). vip-next only asked the question.
//
// The echoed string is requoteArgs(args).join(' '), the same assembly the
// dispatch layer sends to the platform, so what the user approves is exactly
// what runs.
func TestWPProductionConfirmEchoesCommand(t *testing.T) {
	stub := &wpStub{body: wpEnvInfoBody(2)}
	setupWPTest(t, stub)
	defer SetWPYes(false)
	SetWPYes(false)
	t.Setenv("NO_COLOR", "1")

	var seen string
	origConfirm := importConfirmPrompt
	importConfirmPrompt = func(_ *cobra.Command, message string, _ bool) (bool, error) {
		seen = message
		return false, nil
	}
	defer func() { importConfirmPrompt = origConfirm }()

	cmd := WPCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(wpCtx(42, 7, 2, "production"))

	if err := runWP(cmd, []string{"post", "list", "--format=json"}); err != nil {
		t.Fatalf("runWP: %v", err)
	}

	want := "===================================\n" +
		`+ command: wp "post" "list" "--format=json"` + "\n" +
		"===================================\n" +
		"Command cancelled\n"
	if stdout.String() != want {
		t.Errorf("wp confirm output mismatch\n got: %q\nwant: %q", stdout.String(), want)
	}
	wantMsg := "Are you sure you want to run this command on PRODUCTION for site parityapp?"
	if seen != wantMsg {
		t.Errorf("prompt message = %q, want %q", seen, wantMsg)
	}
}

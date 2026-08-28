package commands

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/Khan/genqlient/graphql"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
)

var testANSIRe = regexp.MustCompile("\x1b\\[[0-9;]*m")

// stripTestANSI removes SGR escapes. Used only where internal/output's table
// renderer emits colour unconditionally; NO_COLOR already suppresses colour
// everywhere fatih/color is used.
func stripTestANSI(s string) string { return testANSIRe.ReplaceAllString(s, "") }

// syncConfirmStub answers SyncPreview with a canned body and counts how many
// times the destructive SyncEnvironment mutation was issued.
type syncConfirmStub struct {
	previewBody  string
	previewHits  atomic.Int32
	mutationHits atomic.Int32
}

func (s *syncConfirmStub) start() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bs := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(bs, `"operationName":"ResolveAppByID"`):
			_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"name":"my-app","type":"WordPress","typeId":2,
				"environments":[{"id":7,"appId":7,"name":"develop","type":"develop",
					"uniqueLabel":"develop","defaultDomain":"example.go-vip.net","isMultisite":false}]}}}`))
		case strings.Contains(bs, `"operationName":"SyncPreview"`):
			s.previewHits.Add(1)
			_, _ = w.Write([]byte(s.previewBody))
		case strings.Contains(bs, `"operationName":"SyncEnvironment"`):
			s.mutationHits.Add(1)
			_, _ = w.Write([]byte(`{"data":{"syncEnvironment":{"environment":{"id":7}}}}`))
		case strings.Contains(bs, `"operationName":"SyncProgress"`):
			_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"environments":[
				{"id":7,"syncProgress":{"status":"success","sync":1,"steps":[
					{"name":"Backup","status":"success","step":"backup"}]}}]}}}`))
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	}))
}

func syncConfirmCmd(t *testing.T, srv *httptest.Server) (*cobra.Command, *bytes.Buffer) {
	t.Helper()
	t.Setenv("NO_COLOR", "1")
	client := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	SetConfig(Config{GQLClient: client, AppCtxConfig: appctx.AppContextConfig{Client: client}})
	t.Cleanup(func() { SetConfig(Config{}) })

	// Drive the REAL middleware chain (app resolve -> child env -> confirm ->
	// handler) so the test proves the mutation is or isn't reached, not just
	// what a helper returns.
	cmd := SyncCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	_ = cmd.Flags().Set("app", "42")
	cmd.SetContext(context.Background())
	return cmd, &stdout
}

// Node checks syncPreview.canSync BEFORE issuing the mutation and exits 1
// with the server's own reason (src/lib/cli/command.js:914-920). vip-next
// never queried syncPreview at all, so it fired a sync the server would
// have refused.
func TestSyncConfirmRefusesWhenCanSyncFalse(t *testing.T) {
	stub := &syncConfirmStub{previewBody: `{"data":{"app":{"id":42,"environments":[
		{"id":7,"syncPreview":{"canSync":false,
			"errors":[{"message":"The destination environment has a pending deploy."},
			          {"message":"second error is ignored"}],
			"backup":null,"replacements":[]}}
	]}}}`}
	srv := stub.start()
	defer srv.Close()
	cmd, _ := syncConfirmCmd(t, srv)

	err := cmd.RunE(cmd, nil)
	if err == nil {
		t.Fatal("expected an error when canSync is false")
	}
	want := "Could not sync to this environment: The destination environment has a pending deploy."
	if err.Error() != want {
		t.Errorf("err = %q, want %q", err.Error(), want)
	}
	if got := stub.mutationHits.Load(); got != 0 {
		t.Errorf("SyncEnvironment mutation fired %d times; must be 0 when canSync is false", got)
	}
}

// canSync true: the info table carries App, Environment, the backup date
// (Node key is "From backup", value is Date#toUTCString) and the
// syncPreview.replacements table.
func TestSyncConfirmRendersBackupAndReplacements(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	stub := &syncConfirmStub{previewBody: `{"data":{"app":{"id":42,"environments":[
		{"id":7,"syncPreview":{"canSync":true,"errors":[],
			"backup":{"createdAt":"2025-07-21T10:11:12.000Z"},
			"replacements":[{"from":"a.com","to":"b.com"}]}}
	]}}}`}
	srv := stub.start()
	defer srv.Close()
	cmd, stdout := syncConfirmCmd(t, srv)

	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("RunE: %v", err)
	}
	want := "===================================\n" +
		"+ App: my-app (id: 42)\n" +
		"+ Environment: develop (id: 7)\n" +
		"+ From backup: Mon, 21 Jul 2025 10:11:12 GMT\n" +
		"+ Replacements: \n" +
		"┌───────┬───────┐\n" +
		"│ from  │ to    │\n" +
		"├───────┼───────┤\n" +
		"│ a.com │ b.com │\n" +
		"└───────┴───────┘\n" +
		"===================================\n" +
		"Command cancelled\n"
	// ANSI is stripped only for the embedded table: internal/output/table.go
	// emits colour unconditionally (a separate, pre-existing divergence from
	// Node, which gates on TERM). Every other byte is asserted verbatim.
	if stripTestANSI(stdout.String()) != want {
		t.Errorf("confirm payload mismatch\n got: %q\nwant: %q", stripTestANSI(stdout.String()), want)
	}
	if got := stub.mutationHits.Load(); got != 0 {
		t.Errorf("SyncEnvironment fired %d times after a cancel; must be 0", got)
	}
}

// No backup on the preview -> Node omits the row entirely (command.js:929).
func TestSyncConfirmOmitsBackupRowWhenAbsent(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	stub := &syncConfirmStub{previewBody: `{"data":{"app":{"id":42,"environments":[
		{"id":7,"syncPreview":{"canSync":true,"errors":[],"backup":null,"replacements":[]}}
	]}}}`}
	srv := stub.start()
	defer srv.Close()
	cmd, stdout := syncConfirmCmd(t, srv)

	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("RunE: %v", err)
	}
	if strings.Contains(stdout.String(), "From backup") {
		t.Errorf("no backup -> no 'From backup' row; got %q", stdout.String())
	}
	// formatData([], 'table') is '' in Node, so the Replacements row is the
	// label followed by an empty line.
	want := "===================================\n" +
		"+ App: my-app (id: 42)\n" +
		"+ Environment: develop (id: 7)\n" +
		"+ Replacements: \n" +
		"\n" +
		"===================================\n" +
		"Command cancelled\n"
	if stdout.String() != want {
		t.Errorf("confirm payload mismatch\n got: %q\nwant: %q", stdout.String(), want)
	}
}

// Node's canSync guard lives INSIDE `if (requireConfirm && ! options.force)`,
// so --skip-confirmation / --force skips the syncPreview query entirely and
// goes straight to the mutation. Bug-for-bug: do not add a query Node
// wouldn't issue, and do not block a sync Node would allow.
func TestSyncSkipConfirmationSkipsSyncPreview(t *testing.T) {
	t.Setenv("VIP_SYNC_INTERVAL_MS", "1")
	stub := &syncConfirmStub{previewBody: `{"data":{"app":{"id":42,"environments":[
		{"id":7,"syncPreview":{"canSync":false,"errors":[{"message":"nope"}],
			"backup":null,"replacements":[]}}
	]}}}`}
	srv := stub.start()
	defer srv.Close()
	cmd, _ := syncConfirmCmd(t, srv)
	_ = cmd.Flags().Set("skip-confirmation", "true")

	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("RunE: %v", err)
	}
	if got := stub.previewHits.Load(); got != 0 {
		t.Errorf("SyncPreview queried %d times under --skip-confirmation; Node queries 0", got)
	}
	if got := stub.mutationHits.Load(); got != 1 {
		t.Errorf("SyncEnvironment fired %d times; want 1", got)
	}
}

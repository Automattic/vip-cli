package commands

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/output"
)

// logsStubServer returns a single-response GraphQL stub. The handlers fire
// one query per invocation (RecentLogs), so a constant body is enough.
func logsStubServer(_ *testing.T, body string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
}

// setupLogsConfig wires SetConfig with a genqlient client pointed at srv.
// Tests bypass the WithAppContext + WithEnvContext middleware (handler is
// invoked directly), so we leave Tracker + AppCtxConfig zero.
func setupLogsConfig(srv *httptest.Server) {
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	SetConfig(Config{GQLClient: c})
}

// logsCtx returns a context carrying a pre-resolved AppEnv. The handler
// reads App.ID + Env.ID; everything else can stay zero.
func logsCtx(appID, envID int64) context.Context {
	return appctx.WithAppEnv(context.Background(), &appctx.AppEnv{
		App: appctx.App{ID: appID, Name: "x"},
		Env: appctx.Env{ID: envID, Name: "develop"},
	})
}

func TestValidateLogsInputsOK(t *testing.T) {
	cases := []struct {
		typ   string
		limit int
	}{
		{"app", 1},
		{"app", 500},
		{"app", 5000},
		{"batch", 100},
	}
	for _, tc := range cases {
		if err := validateLogsInputs(tc.typ, tc.limit); err != nil {
			t.Errorf("validateLogsInputs(%q, %d) = %v, want nil", tc.typ, tc.limit, err)
		}
	}
}

func TestValidateLogsInputsBadType(t *testing.T) {
	err := validateLogsInputs("unknown", 500)
	if err == nil {
		t.Fatal("validateLogsInputs(unknown, 500) = nil, want error")
	}
	want := "Invalid type: unknown. The supported types are: app, batch."
	if err.Error() != want {
		t.Errorf("err = %q, want %q", err.Error(), want)
	}
}

func TestValidateLogsInputsLimitTooLow(t *testing.T) {
	err := validateLogsInputs("app", 0)
	if err == nil {
		t.Fatal("validateLogsInputs(app, 0) = nil, want error")
	}
	want := "Invalid limit: 0. Set the limit to an integer between 1 and 5000."
	if err.Error() != want {
		t.Errorf("err = %q, want %q", err.Error(), want)
	}
}

func TestValidateLogsInputsLimitTooHigh(t *testing.T) {
	err := validateLogsInputs("app", 5001)
	if err == nil {
		t.Fatal("validateLogsInputs(app, 5001) = nil, want error")
	}
	want := "Invalid limit: 5001. Set the limit to an integer between 1 and 5000."
	if err.Error() != want {
		t.Errorf("err = %q, want %q", err.Error(), want)
	}
}

func TestRunLogsHappyPathReturnsRows(t *testing.T) {
	srv := logsStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"logs":{"nodes":[{"timestamp":"2024-01-01T00:00:00Z","message":"hello"},{"timestamp":"2024-01-01T00:00:01Z","message":"line\twith\ttabs"}],"pollingDelaySeconds":30}}]}}}`)
	defer srv.Close()
	setupLogsConfig(srv)
	defer SetConfig(Config{})

	cmd := LogsCmd()
	cmd.SetContext(logsCtx(1, 2))

	data, err := runLogs(cmd, nil)
	if err != nil {
		t.Fatalf("runLogs: %v", err)
	}
	rows, ok := data.(output.OrderedRows)
	if !ok {
		t.Fatalf("data type = %T, want output.OrderedRows", data)
	}
	if len(rows) != 2 {
		t.Fatalf("rows len = %d, want 2", len(rows))
	}
	if rows[0][0].Key != "timestamp" || rows[0][0].Value.(string) != "2024-01-01T00:00:00Z" {
		t.Errorf("row[0][0] = %+v, want timestamp=2024-01-01T00:00:00Z", rows[0][0])
	}
	if rows[0][1].Key != "message" || rows[0][1].Value.(string) != "hello" {
		t.Errorf("row[0][1] = %+v, want message=hello", rows[0][1])
	}
	// Verify tab → 4-space normalization for table parity with Node.
	if got := rows[1][1].Value.(string); got != "line    with    tabs" {
		t.Errorf("row[1] message = %q, want %q (tab→4-space normalization)", got, "line    with    tabs")
	}
}

func TestRunLogsEmptyWritesStderrAndReturnsNil(t *testing.T) {
	srv := logsStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"logs":{"nodes":[],"pollingDelaySeconds":30}}]}}}`)
	defer srv.Close()
	setupLogsConfig(srv)
	defer SetConfig(Config{})

	// Redirect os.Stderr to capture the "No logs found" message — Node uses
	// console.error for this, which we mirror by writing to os.Stderr.
	origStderr := os.Stderr
	r, w, _ := os.Pipe()
	os.Stderr = w
	defer func() { os.Stderr = origStderr }()

	cmd := LogsCmd()
	cmd.SetContext(logsCtx(1, 2))

	data, err := runLogs(cmd, nil)
	if err != nil {
		t.Fatalf("runLogs: %v", err)
	}
	if data != nil {
		t.Errorf("data = %+v, want nil for empty-result case", data)
	}
	_ = w.Close()
	var buf bytes.Buffer
	_, _ = buf.ReadFrom(r)
	if !strings.Contains(buf.String(), "No logs found") {
		t.Errorf("stderr = %q, want 'No logs found'", buf.String())
	}
}

func TestRunLogsRejectsBadType(t *testing.T) {
	srv := logsStubServer(t, `{}`)
	defer srv.Close()
	setupLogsConfig(srv)
	defer SetConfig(Config{})

	cmd := LogsCmd()
	_ = cmd.Flags().Set("type", "nope")
	cmd.SetContext(logsCtx(1, 2))

	_, err := runLogs(cmd, nil)
	if err == nil {
		t.Fatal("runLogs: expected error for bad type")
	}
	if !strings.Contains(err.Error(), "Invalid type: nope") {
		t.Errorf("err = %v, want Invalid type: nope", err)
	}
}

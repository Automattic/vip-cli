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

// slowlogsStubServer + setupSlowlogsConfig mirror the logs_test helpers.
func slowlogsStubServer(_ *testing.T, body string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
}

func setupSlowlogsConfig(srv *httptest.Server) {
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	SetConfig(Config{GQLClient: c})
}

func slowlogsCtx(appID, envID int64) context.Context {
	return appctx.WithAppEnv(context.Background(), &appctx.AppEnv{
		App: appctx.App{ID: appID, Name: "x"},
		Env: appctx.Env{ID: envID, Name: "develop"},
	})
}

func TestValidateSlowlogsInputsOK(t *testing.T) {
	for _, lim := range []int{1, 250, 500} {
		if err := validateSlowlogsInputs(lim); err != nil {
			t.Errorf("validateSlowlogsInputs(%d) = %v, want nil", lim, err)
		}
	}
}

// Register 2.19. Node's validateInputs (src/bin/vip-slowlogs.ts:167) gates
// --limit on `slowlogsLib.LIMIT_MAX`, i.e. the value exported by
// src/lib/app-slowlogs/app-slowlogs.ts:9 — which is 5000. The module-local
// `LIMIT_MAX = 500` (vip-slowlogs.ts:21) is referenced ONLY by followLogs'
// refetch (line 78) and by the (wrong) --help copy. Anything in 501..5000
// must be accepted.
func TestValidateSlowlogsInputsAcceptsAboveLocalFollowCeiling(t *testing.T) {
	for _, lim := range []int{501, 1000, 5000} {
		if err := validateSlowlogsInputs(lim); err != nil {
			t.Errorf("validateSlowlogsInputs(%d) = %v, want nil (Node ceiling is slowlogsLib.LIMIT_MAX=5000)", lim, err)
		}
	}
}

func TestValidateSlowlogsInputsLimitTooLow(t *testing.T) {
	err := validateSlowlogsInputs(0)
	if err == nil {
		t.Fatal("validateSlowlogsInputs(0) = nil, want error")
	}
	want := "Invalid limit: 0. Set the limit to an integer between 1 and 5000."
	if err.Error() != want {
		t.Errorf("err = %q, want %q", err.Error(), want)
	}
}

func TestValidateSlowlogsInputsLimitTooHigh(t *testing.T) {
	err := validateSlowlogsInputs(5001)
	if err == nil {
		t.Fatal("validateSlowlogsInputs(5001) = nil, want error")
	}
	want := "Invalid limit: 5001. Set the limit to an integer between 1 and 5000."
	if err.Error() != want {
		t.Errorf("err = %q, want %q", err.Error(), want)
	}
}

// The module-local LIMIT_MAX=500 survives as the follow-mode refetch size
// (vip-slowlogs.ts:78 `const limit = isFirstRequest ? opt.limit : LIMIT_MAX`).
// It must NOT be conflated with the validation ceiling.
func TestSlowlogsFollowRefetchLimitIsLocalLimitMax(t *testing.T) {
	if slowlogsFollowLimit != 500 {
		t.Errorf("slowlogsFollowLimit = %d, want 500 (vip-slowlogs.ts:21 LIMIT_MAX)", slowlogsFollowLimit)
	}
	if slowlogsValidationMax == slowlogsFollowLimit {
		t.Error("validation ceiling must not be the follow-refetch limit — that is the 2.19 bug")
	}
}

func TestRunSlowlogsHappyPathReturnsRows(t *testing.T) {
	srv := slowlogsStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"slowlogs":{"nodes":[{"timestamp":"2024-01-01T00:00:00Z","rowsSent":"10","rowsExamined":"1000","queryTime":"1.234","requestUri":"/wp-admin/edit.php","query":"SELECT 1"}],"pollingDelaySeconds":30}}]}}}`)
	defer srv.Close()
	setupSlowlogsConfig(srv)
	defer SetConfig(Config{})

	cmd := SlowlogsCmd()
	cmd.SetContext(slowlogsCtx(1, 2))

	data, err := runSlowlogs(cmd, nil)
	if err != nil {
		t.Fatalf("runSlowlogs: %v", err)
	}
	rows, ok := data.(output.OrderedRows)
	if !ok {
		t.Fatalf("data type = %T, want output.OrderedRows", data)
	}
	if len(rows) != 1 {
		t.Fatalf("rows len = %d, want 1", len(rows))
	}
	// Column ordering must match Node's printSlowlogs destructure:
	// timestamp, rowsSent, rowsExamined, queryTime, requestUri, query.
	wantKeys := []string{"timestamp", "rowsSent", "rowsExamined", "queryTime", "requestUri", "query"}
	if len(rows[0]) != len(wantKeys) {
		t.Fatalf("row[0] columns = %d, want %d", len(rows[0]), len(wantKeys))
	}
	for i, k := range wantKeys {
		if rows[0][i].Key != k {
			t.Errorf("row[0][%d].Key = %q, want %q", i, rows[0][i].Key, k)
		}
	}
	if rows[0][5].Value.(string) != "SELECT 1" {
		t.Errorf("row[0][5].Value = %v, want SELECT 1", rows[0][5].Value)
	}
}

func TestRunSlowlogsEmptyWritesStderrAndReturnsNil(t *testing.T) {
	srv := slowlogsStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"slowlogs":{"nodes":[],"pollingDelaySeconds":30}}]}}}`)
	defer srv.Close()
	setupSlowlogsConfig(srv)
	defer SetConfig(Config{})

	origStderr := os.Stderr
	r, w, _ := os.Pipe()
	os.Stderr = w
	defer func() { os.Stderr = origStderr }()

	cmd := SlowlogsCmd()
	cmd.SetContext(slowlogsCtx(1, 2))

	data, err := runSlowlogs(cmd, nil)
	if err != nil {
		t.Fatalf("runSlowlogs: %v", err)
	}
	if data != nil {
		t.Errorf("data = %+v, want nil for empty-result case", data)
	}
	_ = w.Close()
	var buf bytes.Buffer
	_, _ = buf.ReadFrom(r)
	// Node parity: same 'No logs found' wording as vip logs (yes,
	// "logs" in the slowlogs message — see src/bin/vip-slowlogs.ts).
	if !strings.Contains(buf.String(), "No logs found") {
		t.Errorf("stderr = %q, want 'No logs found'", buf.String())
	}
}

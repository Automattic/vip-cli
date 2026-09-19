package commands

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/output"
)

// envvarStubServer returns a single-response GraphQL stub. The handlers
// fire one query per invocation (List, Get, GetAll), so a constant body is
// enough — only the envvar-with-values shape changes between operations.
func envvarStubServer(_ *testing.T, body string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
}

// setupEnvvarConfig wires SetConfig with a genqlient client pointed at srv.
// Production also wires Tracker + AppCtxConfig; tests don't need either
// because runEnvvarList / runEnvvarGet / runEnvvarGetAll are invoked
// directly (bypassing the WithAppContext + WithEnvContext middleware).
func setupEnvvarConfig(srv *httptest.Server) {
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	SetConfig(Config{GQLClient: c})
}

// ctxWithAppEnv returns a context carrying a pre-resolved AppEnv. The
// handlers consume App.ID + Env.ID; everything else can stay zero.
func ctxWithAppEnv(appID, envID int64) context.Context {
	return appctx.WithAppEnv(context.Background(), &appctx.AppEnv{
		App: appctx.App{ID: appID, Name: "x"},
		Env: appctx.Env{ID: envID, Name: "develop"},
	})
}

func TestConfigEnvvarListReturnsNames(t *testing.T) {
	srv := envvarStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":2,"nodes":[{"name":"FOO"},{"name":"BAR"}]}}]}}}`)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarListCmd()
	cmd.SetContext(ctxWithAppEnv(1, 2))

	data, err := runEnvvarList(cmd, nil)
	if err != nil {
		t.Fatalf("runEnvvarList: %v", err)
	}
	rows, ok := data.(output.OrderedRows)
	if !ok {
		t.Fatalf("data type = %T, want output.OrderedRows", data)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2 (got %+v)", len(rows), rows)
	}
	if rows[0][0].Key != "name" || rows[0][0].Value.(string) != "FOO" {
		t.Errorf("row[0] = %+v, want name=FOO", rows[0])
	}
	if rows[1][0].Value.(string) != "BAR" {
		t.Errorf("row[1] value = %v, want BAR", rows[1][0].Value)
	}
}

func TestConfigEnvvarListEmptyPrintsYellow(t *testing.T) {
	srv := envvarStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":0,"nodes":[]}}]}}}`)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarListCmd()
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	cmd.SetContext(ctxWithAppEnv(1, 2))

	data, err := runEnvvarList(cmd, nil)
	if err != nil {
		t.Fatalf("runEnvvarList: %v", err)
	}
	if data != nil {
		t.Errorf("empty case must return nil data; got %+v", data)
	}
	if !strings.Contains(buf.String(), "There are no environment variables") {
		t.Errorf("empty case must print Node-parity message; got=%q", buf.String())
	}
}

func TestConfigEnvvarListKeyValueChangesColumn(t *testing.T) {
	srv := envvarStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":1,"nodes":[{"name":"FOO"}]}}]}}}`)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarListCmd()
	_ = cmd.Flags().Set("format", "keyValue")
	cmd.SetContext(ctxWithAppEnv(1, 2))

	data, err := runEnvvarList(cmd, nil)
	if err != nil {
		t.Fatalf("runEnvvarList: %v", err)
	}
	rows := data.(output.OrderedRows)
	if rows[0][0].Key != "key" {
		t.Errorf("keyValue format must use 'key' column; got %q", rows[0][0].Key)
	}
}

func TestConfigEnvvarListIdsChangesColumn(t *testing.T) {
	srv := envvarStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":1,"nodes":[{"name":"FOO"}]}}]}}}`)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarListCmd()
	_ = cmd.Flags().Set("format", "ids")
	cmd.SetContext(ctxWithAppEnv(1, 2))

	data, err := runEnvvarList(cmd, nil)
	if err != nil {
		t.Fatalf("runEnvvarList: %v", err)
	}
	rows := data.(output.OrderedRows)
	if rows[0][0].Key != "id" {
		t.Errorf("ids format must use 'id' column; got %q", rows[0][0].Key)
	}
}

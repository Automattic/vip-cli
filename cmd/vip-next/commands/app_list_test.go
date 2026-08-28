package commands

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"
)

func TestAppListRendersTable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"apps":{"total":2,"nextCursor":null,"edges":[
		  {"id":8886,"name":"example-app","repo":"wpcomvip/example-app"},
		  {"id":4325,"name":"mytestmultisite","repo":"wpcomvip/mytestmultisite"}
		]}}}`))
	}))
	defer srv.Close()

	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client())})
	defer SetConfig(Config{})

	cmd := AppListCmd()
	cmd.SetContext(context.Background())
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}
	out := buf.String()
	for _, want := range []string{"8886", "example-app", "wpcomvip/example-app", "4325", "mytestmultisite"} {
		if !strings.Contains(out, want) {
			t.Errorf("table output missing %q in:\n%s", want, out)
		}
	}
}

func TestAppListEmptyPrintsMessage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"total":0,"nextCursor":null,"edges":[]}}}`))
	}))
	defer srv.Close()
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client())})
	defer SetConfig(Config{})

	cmd := AppListCmd()
	cmd.SetContext(context.Background())
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if !strings.Contains(stdout.String(), "No apps found") {
		t.Errorf("empty case must print 'No apps found' (Node parity); got: %q", stdout.String())
	}
}

func TestAppListJSONFormat(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"total":1,"nextCursor":null,"edges":[
		  {"id":1,"name":"x","repo":"r"}
		]}}}`))
	}))
	defer srv.Close()
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client())})
	defer SetConfig(Config{})

	cmd := AppListCmd()
	cmd.SetContext(context.Background())
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	cmd.SetArgs([]string{"--format=json"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if !strings.Contains(buf.String(), `"id": 1`) && !strings.Contains(buf.String(), `"id":1`) {
		t.Errorf("json output missing id field: %s", buf.String())
	}
}

func TestAppListInvalidFormatRejected(t *testing.T) {
	cmd := AppListCmd()
	cmd.SetContext(context.Background())
	var buf bytes.Buffer
	cmd.SetErr(&buf)
	cmd.SetArgs([]string{"--format=yaml"})
	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "Invalid format: yaml") {
		t.Errorf("err = %v, want Node-parity invalid-format error", err)
	}
}

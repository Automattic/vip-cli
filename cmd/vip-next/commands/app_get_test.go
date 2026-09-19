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

func TestAppGetHappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{
		  "id":42,"name":"example-app","repo":"wpcomvip/example-app",
		  "environments":[
		    {"id":7,"appId":42,"name":"develop","type":"develop","branch":"main",
		     "currentCommit":"abcdef1234567890","primaryDomain":{"name":"dev.example.com"},
		     "launched":false,"deploymentStrategy":"git"}
		  ]
		}]}}}`))
	}))
	defer srv.Close()
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client())})
	defer SetConfig(Config{})

	cmd := AppGetCmd()
	cmd.SetContext(context.Background())
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	if err := RunAppGet(cmd, []string{"example-app"}); err != nil {
		t.Fatalf("RunAppGet: %v", err)
	}
	out := buf.String()
	for _, want := range []string{"develop", "abcdef1"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q in:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"id: 42", "name: example-app", "repo: wpcomvip/example-app"} {
		if strings.Contains(out, unwanted) {
			t.Errorf("Node app get returns only environment rows; output must not contain %q:\n%s", unwanted, out)
		}
	}
	if strings.Contains(out, "abcdef1234567890") {
		t.Errorf("currentCommit must be shortened to 7 chars; got full hash:\n%s", out)
	}
	if strings.Contains(out, "deploymentStrategy") || strings.Contains(out, "DEPLOYMENTSTRATEGY") {
		t.Errorf("deploymentStrategy column must be hidden:\n%s", out)
	}
}

func TestAppGetByIDHappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"app":{
		  "id":42,"name":"example-app","repo":"wpcomvip/example-app",
		  "environments":[
		    {"id":42,"appId":42,"name":"production","type":"production","branch":"main",
		     "currentCommit":"abcdef1234567890","primaryDomain":{"name":"www.example.com"},
		     "launched":true,"deploymentStrategy":"git"}
		  ]
		}}}`))
	}))
	defer srv.Close()
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client())})
	defer SetConfig(Config{})

	cmd := AppGetCmd()
	cmd.SetContext(context.Background())
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	if err := RunAppGet(cmd, []string{"42"}); err != nil {
		t.Fatalf("RunAppGet: %v", err)
	}
	out := buf.String()
	// For the main env (env.appId == env.id), getEnvIdentifier returns "type".
	for _, want := range []string{"www.example.com", "production"} {
		if !strings.Contains(out, want) {
			t.Errorf("byID output missing %q in:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"id: 42", "name: example-app", "repo: wpcomvip/example-app"} {
		if strings.Contains(out, unwanted) {
			t.Errorf("Node app get returns only environment rows; output must not contain %q:\n%s", unwanted, out)
		}
	}
}

func TestAppGetCSVDoesNotPrintAppHeader(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"app":{
		  "id":42,"name":"example-app","repo":"wpcomvip/example-app",
		  "environments":[
		    {"id":42,"appId":42,"name":"production","type":"production","branch":"main",
		     "currentCommit":"abcdef1234567890","primaryDomain":{"name":"www.example.com"},
		     "launched":true,"deploymentStrategy":"git"}
		  ]
		}}}`))
	}))
	defer srv.Close()
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client())})
	defer SetConfig(Config{})

	cmd := AppGetCmd()
	cmd.SetContext(context.Background())
	_ = cmd.Flags().Set("format", "csv")
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	if err := RunAppGet(cmd, []string{"42"}); err != nil {
		t.Fatalf("RunAppGet: %v", err)
	}
	out := buf.String()
	if strings.Contains(out, "# id:") || strings.Contains(out, "# name:") || strings.Contains(out, "# repo:") {
		t.Fatalf("CSV must contain only environment rows, got:\n%s", out)
	}
	if !strings.HasPrefix(out, `"id","app id","name"`) {
		t.Fatalf("CSV must start with environment columns, got:\n%s", out)
	}
}

func TestAppGetNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[]}}}`))
	}))
	defer srv.Close()
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client())})
	defer SetConfig(Config{})

	cmd := AppGetCmd()
	cmd.SetContext(context.Background())
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	if err := RunAppGet(cmd, []string{"ghost"}); err != nil {
		t.Fatalf("RunAppGet: %v", err)
	}
	if !strings.Contains(buf.String(), "App ghost was not found") {
		t.Errorf("not-found path must print Node-parity message; got: %s", buf.String())
	}
}

func TestAppGetCustomDeployUsesDashBranch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{
		  "id":42,"name":"x","repo":"r",
		  "environments":[
		    {"id":7,"appId":42,"name":"production","type":"production","branch":"main",
		     "currentCommit":"abc1234","primaryDomain":{"name":"x.com"},
		     "launched":true,"deploymentStrategy":"custom-deploy"}
		  ]
		}]}}}`))
	}))
	defer srv.Close()
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client())})
	defer SetConfig(Config{})

	cmd := AppGetCmd()
	cmd.SetContext(context.Background())
	_ = cmd.Flags().Set("format", "json")
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	if err := RunAppGet(cmd, []string{"x"}); err != nil {
		t.Fatalf("RunAppGet: %v", err)
	}
	// The branch value should be "-" for custom-deploy. Use JSON assertions so
	// the word "domain" in the humanized table header cannot match "main".
	out := buf.String()
	if strings.Contains(out, `"branch": "main"`) {
		t.Errorf("branch should be \"-\" for custom-deploy, not \"main\"; got:\n%s", out)
	}
	if !strings.Contains(out, `"branch": "-"`) {
		t.Errorf("expected dash for custom-deploy branch in:\n%s", out)
	}
}

func TestAppGetInvalidFormat(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{
		  "id":1,"name":"x","repo":"r",
		  "environments":[{"id":1,"appId":1,"name":"production","type":"production",
		     "branch":"main","currentCommit":"abcdefg","primaryDomain":{"name":"x.com"},
		     "launched":true,"deploymentStrategy":"git"}]
		}]}}}`))
	}))
	defer srv.Close()
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client())})
	defer SetConfig(Config{})

	cmd := AppGetCmd()
	cmd.SetContext(context.Background())
	_ = cmd.Flags().Set("format", "yaml")
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	err := RunAppGet(cmd, []string{"x"})
	if err == nil || !strings.Contains(err.Error(), "Invalid format: yaml") {
		t.Errorf("err = %v, want Node-parity invalid-format error", err)
	}
}

func TestAppGetJSONFormat(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{
		  "id":1,"name":"x","repo":"r",
		  "environments":[{"id":1,"appId":1,"name":"production","type":"production",
		     "branch":"main","currentCommit":"abcdefg","primaryDomain":{"name":"x.com"},
		     "launched":true,"deploymentStrategy":"git"}]
		}]}}}`))
	}))
	defer srv.Close()
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client())})
	defer SetConfig(Config{})

	cmd := AppGetCmd()
	cmd.SetContext(context.Background())
	_ = cmd.Flags().Set("format", "json")
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	if err := RunAppGet(cmd, []string{"x"}); err != nil {
		t.Fatalf("RunAppGet: %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, `"primaryDomain"`) || !strings.Contains(out, "x.com") {
		t.Errorf("json output missing flattened primaryDomain: %s", out)
	}
}

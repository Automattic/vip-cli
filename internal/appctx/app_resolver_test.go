package appctx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"
	"github.com/spf13/cobra"
)

func gqlClientForServer(srv *httptest.Server) graphql.Client {
	return graphql.NewClient(srv.URL+"/graphql", srv.Client())
}

func makeAppCmd(app, env string, nonInteractive bool) *cobra.Command {
	cmd := &cobra.Command{Use: "x"}
	cmd.PersistentFlags().String("app", app, "")
	cmd.PersistentFlags().String("env", env, "")
	cmd.PersistentFlags().Bool("non-interactive", false, "")
	if nonInteractive {
		_ = cmd.PersistentFlags().Set("non-interactive", "true")
	}
	cmd.SetContext(context.Background())
	return cmd
}

func TestWithAppContextResolvesByName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{"id":42,"name":"myapp","environments":[{"id":7,"name":"develop","type":"develop","defaultDomain":"d.example","isMultisite":true}]}]}}}`))
	}))
	defer srv.Close()
	cmd := makeAppCmd("myapp", "", true)

	mw := WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)})
	called := false
	run := mw(func(cmd *cobra.Command, args []string) error {
		ae := FromContext(cmd.Context())
		if ae == nil || ae.App.ID != 42 || ae.App.Name != "myapp" {
			t.Errorf("AppEnv = %+v", ae)
		}
		envs := ae.AvailableEnvs()
		if len(envs) != 1 || envs[0].ID != 7 || envs[0].Type != "develop" || envs[0].DefaultDomain != "d.example" {
			t.Errorf("AvailableEnvs = %+v", envs)
		}
		if !envs[0].IsMultisite {
			t.Errorf("AvailableEnvs[0].IsMultisite = false, want true")
		}
		called = true
		return nil
	})
	if err := run(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !called {
		t.Error("inner handler not called")
	}
}

func TestWithAppContextResolvesByID(t *testing.T) {
	var gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := make([]byte, 4096)
		n, _ := r.Body.Read(buf)
		gotBody = string(buf[:n])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"name":"myapp","environments":[{"id":7,"name":"develop","type":"develop","isMultisite":true}]}}}`))
	}))
	defer srv.Close()
	cmd := makeAppCmd("42", "", true)

	mw := WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)})
	called := false
	run := mw(func(cmd *cobra.Command, args []string) error {
		ae := FromContext(cmd.Context())
		if ae == nil || ae.App.ID != 42 || ae.App.Name != "myapp" {
			t.Errorf("AppEnv = %+v", ae)
		}
		envs := ae.AvailableEnvs()
		if len(envs) != 1 || !envs[0].IsMultisite {
			t.Errorf("AvailableEnvs = %+v, want one multisite env", envs)
		}
		called = true
		return nil
	})
	if err := run(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !called {
		t.Error("inner handler not called")
	}
	if !strings.Contains(gotBody, "ResolveAppByID") {
		t.Errorf("expected ResolveAppByID in request body; got %s", gotBody)
	}
}

func TestWithAppContextMissingAppNonInteractive(t *testing.T) {
	cmd := makeAppCmd("", "", true)
	mw := WithAppContext(AppContextConfig{Client: nil})
	run := mw(func(cmd *cobra.Command, args []string) error {
		t.Error("inner handler must not be called")
		return nil
	})
	err := run(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "--app") {
		t.Errorf("err = %v, want missing --app error", err)
	}
}

func TestWithAppContextNotFoundByName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[]}}}`))
	}))
	defer srv.Close()
	cmd := makeAppCmd("ghost", "", true)
	mw := WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)})
	run := mw(func(cmd *cobra.Command, args []string) error {
		t.Error("inner must not be called when app not found")
		return nil
	})
	err := run(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "ghost") {
		t.Errorf("err = %v, want not-found error mentioning the key", err)
	}
}

func TestWithAppContextNotFoundByID(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"app":null}}`))
	}))
	defer srv.Close()
	cmd := makeAppCmd("999", "", true)
	mw := WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)})
	run := mw(func(cmd *cobra.Command, args []string) error {
		t.Error("inner must not be called when app not found")
		return nil
	})
	err := run(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "999") {
		t.Errorf("err = %v, want not-found error mentioning the id", err)
	}
}

func TestWithAppContextNilClientErrors(t *testing.T) {
	cmd := makeAppCmd("myapp", "", true)
	mw := WithAppContext(AppContextConfig{Client: nil})
	run := mw(func(cmd *cobra.Command, args []string) error {
		t.Error("inner must not be called when client is nil")
		return nil
	})
	err := run(cmd, nil)
	if err == nil {
		t.Fatal("expected an error when Client is nil")
	}
}

func TestWithAppContextPopulatesTypeId(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{"id":42,"name":"x","typeId":3,"environments":[{"id":7,"appId":42,"name":"develop","type":"develop","defaultDomain":"d.example"}]}]}}}`))
	}))
	defer srv.Close()
	cmd := makeAppCmd("x", "", true)

	mw := WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)})
	called := false
	run := mw(func(cmd *cobra.Command, args []string) error {
		ae := FromContext(cmd.Context())
		if ae == nil {
			t.Fatal("AppEnv is nil")
		}
		if ae.App.TypeId != 3 {
			t.Errorf("App.TypeId = %d, want 3", ae.App.TypeId)
		}
		called = true
		return nil
	})
	if err := run(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !called {
		t.Error("inner handler not called")
	}
}

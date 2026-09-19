package appctx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func makeEnvCmd(app, env string, nonInteractive bool) *cobra.Command {
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

// TestWithEnvContextResolvesByTypeMainEnv reproduces the @app.production
// alias case: env.name = app slug, env.type = "production", env.appId =
// env.id (main env). Node's getEnvIdentifier returns env.type here, so
// `--env=production` must match.
func TestWithEnvContextResolvesByTypeMainEnv(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{"id":3453,"name":"cantina-trunk-staging","environments":[{"id":3453,"appId":3453,"name":"cantina-trunk-staging","type":"production","defaultDomain":"www.example"}]}]}}}`))
	}))
	defer srv.Close()
	cmd := makeEnvCmd("cantina-trunk-staging", "production", true)
	mw := Chain(
		WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)}),
		WithEnvContext(),
	)
	run := mw(func(cmd *cobra.Command, args []string) error {
		ae := FromContext(cmd.Context())
		if ae == nil || ae.Env.Type != "production" || ae.Env.ID != 3453 {
			t.Errorf("Env = %+v", ae)
		}
		return nil
	})
	if err := run(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
}

func TestWithEnvContextResolves(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{"id":42,"name":"myapp","environments":[{"id":7,"name":"develop","type":"develop","defaultDomain":"d.example"},{"id":1,"name":"production","type":"production","defaultDomain":"p.example"}]}]}}}`))
	}))
	defer srv.Close()
	cmd := makeEnvCmd("myapp", "develop", true)
	mw := Chain(
		WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)}),
		WithEnvContext(),
	)
	run := mw(func(cmd *cobra.Command, args []string) error {
		ae := FromContext(cmd.Context())
		if ae == nil || ae.Env.ID != 7 || ae.Env.Name != "develop" || ae.Env.Type != "develop" {
			t.Errorf("Env = %+v", ae)
		}
		return nil
	})
	if err := run(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
}

func TestWithEnvContextEnvNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{"id":42,"name":"myapp","environments":[{"id":7,"name":"develop","type":"develop"}]}]}}}`))
	}))
	defer srv.Close()
	cmd := makeEnvCmd("myapp", "ghostenv", true)
	mw := Chain(
		WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)}),
		WithEnvContext(),
	)
	run := mw(func(cmd *cobra.Command, args []string) error {
		t.Error("must not be called")
		return nil
	})
	err := run(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "ghostenv") {
		t.Errorf("err = %v, want not-found", err)
	}
	if !strings.Contains(err.Error(), "develop") {
		t.Errorf("err should list available envs; got %v", err)
	}
}

func TestWithEnvContextAutoSelectsSingleEnv(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{"id":42,"name":"myapp","environments":[{"id":7,"name":"develop","type":"develop"}]}]}}}`))
	}))
	defer srv.Close()
	cmd := makeEnvCmd("myapp", "", true)
	mw := Chain(
		WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)}),
		WithEnvContext(),
	)
	run := mw(func(cmd *cobra.Command, args []string) error {
		ae := FromContext(cmd.Context())
		if ae == nil || ae.Env.ID != 7 {
			t.Errorf("Env = %+v", ae)
		}
		return nil
	})
	if err := run(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
}

func TestWithEnvContextMultipleNonInteractiveRequiresFlag(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{"id":42,"name":"myapp","environments":[{"id":7,"name":"develop","type":"develop"},{"id":1,"name":"production","type":"production"}]}]}}}`))
	}))
	defer srv.Close()
	cmd := makeEnvCmd("myapp", "", true)
	mw := Chain(
		WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)}),
		WithEnvContext(),
	)
	run := mw(func(cmd *cobra.Command, args []string) error {
		t.Error("must not be called without --env")
		return nil
	})
	err := run(cmd, nil)
	if err == nil {
		t.Fatal("expected error when --env required and not set in non-interactive mode")
	}
	if !strings.Contains(err.Error(), "develop") || !strings.Contains(err.Error(), "production") {
		t.Errorf("err should list available envs; got %v", err)
	}
}

func TestWithEnvContextNoEnvs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{"id":42,"name":"myapp","environments":[]}]}}}`))
	}))
	defer srv.Close()
	cmd := makeEnvCmd("myapp", "", true)
	mw := Chain(
		WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)}),
		WithEnvContext(),
	)
	run := mw(func(cmd *cobra.Command, args []string) error {
		t.Error("must not be called")
		return nil
	})
	err := run(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "myapp") {
		t.Errorf("err = %v, want error mentioning the app has no envs", err)
	}
}

func TestWithEnvContextMissingAppCtxErrors(t *testing.T) {
	cmd := makeEnvCmd("myapp", "develop", true)
	mw := WithEnvContext()
	run := mw(func(cmd *cobra.Command, args []string) error {
		t.Error("must not be called when AppContext missing")
		return nil
	})
	err := run(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "WithAppContext") {
		t.Errorf("err = %v, want a clear 'WithAppContext required earlier in chain' error", err)
	}
}

func TestWithChildEnvContextRejectsProduction(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{"id":42,"name":"myapp","environments":[{"id":1,"name":"production","type":"production"}]}]}}}`))
	}))
	defer srv.Close()
	cmd := makeEnvCmd("myapp", "production", true)
	mw := Chain(
		WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)}),
		WithChildEnvContext(),
	)
	run := mw(func(cmd *cobra.Command, args []string) error {
		t.Error("must not be called for production")
		return nil
	})
	err := run(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "production") {
		t.Errorf("err = %v, want production rejection", err)
	}
}

func TestWithChildEnvContextAllowsDevelop(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"apps":{"edges":[{"id":42,"name":"myapp","environments":[{"id":7,"name":"develop","type":"develop"}]}]}}}`))
	}))
	defer srv.Close()
	cmd := makeEnvCmd("myapp", "develop", true)
	mw := Chain(
		WithAppContext(AppContextConfig{Client: gqlClientForServer(srv)}),
		WithChildEnvContext(),
	)
	called := false
	run := mw(func(cmd *cobra.Command, args []string) error {
		called = true
		return nil
	})
	if err := run(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !called {
		t.Error("inner not called on develop env")
	}
}

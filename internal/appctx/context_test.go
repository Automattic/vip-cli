package appctx

import (
	"context"
	"testing"
)

func TestAppEnvRoundTrip(t *testing.T) {
	ctx := context.Background()
	ae := &AppEnv{
		App: App{ID: 42, Name: "myapp"},
		Env: Env{ID: 7, Name: "develop", Type: "develop"},
	}
	ctx = WithAppEnv(ctx, ae)
	got := FromContext(ctx)
	if got == nil {
		t.Fatal("FromContext returned nil")
	}
	if got.App.ID != 42 || got.App.Name != "myapp" {
		t.Errorf("App = %+v", got.App)
	}
	if got.Env.ID != 7 || got.Env.Type != "develop" {
		t.Errorf("Env = %+v", got.Env)
	}
}

func TestFromContextEmpty(t *testing.T) {
	if got := FromContext(context.Background()); got != nil {
		t.Errorf("FromContext(empty) = %+v, want nil", got)
	}
}

func TestFromContextIgnoresOtherKeys(t *testing.T) {
	type otherKey struct{}
	ctx := context.WithValue(context.Background(), otherKey{}, "intruder")
	if got := FromContext(ctx); got != nil {
		t.Errorf("FromContext on unrelated key = %+v, want nil", got)
	}
}

// AvailableEnvs returns the env list populated by WithAppContext for
// WithEnvContext to consume. This test pins the contract.
func TestAvailableEnvsRoundTrip(t *testing.T) {
	ae := &AppEnv{App: App{ID: 1, Name: "a"}}
	ae.SetAvailableEnvs([]Env{
		{ID: 1, Name: "production", Type: "production"},
		{ID: 2, Name: "develop", Type: "develop"},
	})
	got := ae.AvailableEnvs()
	if len(got) != 2 {
		t.Fatalf("AvailableEnvs len = %d, want 2", len(got))
	}
	if got[0].Type != "production" || got[1].Type != "develop" {
		t.Errorf("envs = %+v", got)
	}
}

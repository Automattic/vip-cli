package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/telemetry"
)

func TestEnvironmentPATCommandDoesNotConstructKeychain(t *testing.T) {
	raw := validBootstrapRaw(t, 84)
	t.Setenv("VIP_CLI_TOKEN", raw)
	t.Setenv("DO_NOT_TRACK", "1")
	var bearer string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bearer = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"me":{"id":84,"displayName":"Environment User","trackingUserId":"84","isVIP":true,"organizationRoles":{"nodes":[]}}}}`))
	}))
	defer srv.Close()
	t.Setenv("API_HOST", srv.URL)

	err := runWithDeps([]string{"whoami"}, runDeps{
		Tracker: &telemetry.Tracker{Disabled: true},
		NewKeychain: func(string) *keychain.Keychain {
			t.Fatal("environment PAT command constructed a keychain")
			return nil
		},
		NewLogin: func(*auth.Store) func() (*auth.Token, error) {
			return func() (*auth.Token, error) { return nil, errors.New("must not prompt") }
		},
	})
	if err != nil || bearer != "Bearer "+raw {
		t.Fatalf("runWithDeps = %v, Authorization = %q", err, bearer)
	}
}

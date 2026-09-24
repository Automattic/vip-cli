package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestEnvironmentPATBypassedAPICommand(t *testing.T) {
	for _, tc := range []struct {
		name  string
		raw   string
		valid bool
	}{
		{"malformed", "not-a-jwt", false},
		{"missing-id", validBootstrapRaw(t, 0), false},
		{"valid", validBootstrapRaw(t, 84), true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("VIP_CLI_TOKEN", tc.raw)
			t.Setenv("DO_NOT_TRACK", "1")
			rec := &gqlOpRecorder{}
			srv := rec.server(t, map[string]string{
				"ResolveAppByName":                  resolveAppByNameBody,
				"GetEnvironmentVariablesWithValues": envVarsWithValuesBody,
			})
			defer srv.Close()
			t.Setenv("API_HOST", srv.URL)
			err := runWithDeps([]string{"config", "envvar", "get", "help", "--app", "example", "--env", "develop"}, runDeps{
				Tracker:     &telemetry.Tracker{Disabled: true},
				NewKeychain: func(string) *keychain.Keychain { t.Fatal("must not construct keychain"); return nil },
				NewLogin:    func(*auth.Store) func() (*auth.Token, error) { t.Fatal("must not login"); return nil },
			})
			if !tc.valid {
				if err == nil || !strings.Contains(err.Error(), "VIP_CLI_TOKEN") || len(rec.ops) != 0 {
					t.Fatalf("invalid PAT: error = %v, requests = %v; want actionable error before requests", err, rec.ops)
				}
			} else {
				if err != nil || len(rec.ops) != 2 {
					t.Fatalf("valid PAT: error = %v, requests = %v", err, rec.ops)
				}
				for _, got := range rec.auth {
					if got != "Bearer "+tc.raw {
						t.Fatalf("request did not use environment PAT")
					}
				}
			}
		})
	}
}

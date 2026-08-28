package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/telemetry"
)

// gqlOpRecorder is a GraphQL stub that dispatches on the operationName in the
// request body and records which operations were asked for. It is deliberately
// dumb: the responses are the minimum genqlient will unmarshal.
type gqlOpRecorder struct {
	mu   sync.Mutex
	ops  []string
	auth []string
}

func (r *gqlOpRecorder) server(t *testing.T, bodies map[string]string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		raw, _ := io.ReadAll(req.Body)
		op := ""
		for name := range bodies {
			if strings.Contains(string(raw), `"operationName":"`+name+`"`) {
				op = name
				break
			}
		}
		r.mu.Lock()
		r.ops = append(r.ops, op)
		r.auth = append(r.auth, req.Header.Get("Authorization"))
		r.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if op == "" {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"errors":[{"message":"unexpected operation: ` + string(raw) + `"}]}`))
			return
		}
		_, _ = w.Write([]byte(bodies[op]))
	}))
}

func (r *gqlOpRecorder) saw(op string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, seen := range r.ops {
		if seen == op {
			return true
		}
	}
	return false
}

const (
	resolveAppByNameBody = `{"data":{"apps":{"edges":[{"id":1,"name":"example","type":"WordPress","typeId":2,` +
		`"environments":[{"id":2,"appId":1,"name":"develop","type":"develop","uniqueLabel":"example-develop",` +
		`"defaultDomain":"example-develop.go-vip.net","isMultisite":false}]}]}}}`
	envVarsWithValuesBody = `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":` +
		`{"total":1,"nodes":[{"name":"HELP","value":"not-a-bypass"}]}}]}}}`
)

// TestBypassedArgvStillReachesTheAPI reproduces register item 2.13.
//
// Node's src/bin/vip.js decides only ONE thing with its argv scan: whether to
// run the interactive login flow. When it skips it, runCmd() still has full API
// access, because src/lib/api/http.ts loads the token from the keychain on every
// request. vip-next conflated "skip login" with "skip API setup": a bypassed
// argv got a commands.Config with no GQLClient, so any command whose argv merely
// CONTAINED a bypass word ("help", "login", "logout", "-v", ...) died with
// "appctx: GraphQL client not configured".
//
// `config envvar get help` is one of the three invocations the parity review
// verified as broken. A stored, valid token exists here, so Node would have run
// the command against the API — and so must vip-next.
func TestBypassedArgvStillReachesTheAPI(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "1")
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	t.Setenv("WPVIP_DEPLOY_TOKEN", "")

	rec := &gqlOpRecorder{}
	srv := rec.server(t, map[string]string{
		"ResolveAppByName":                  resolveAppByNameBody,
		"GetEnvironmentVariablesWithValues": envVarsWithValuesBody,
	})
	defer srv.Close()
	t.Setenv("API_HOST", srv.URL)

	raw := validBootstrapRaw(t, 10000)
	backend := &bootstrapBackend{}
	testKeychain := newBootstrapKeychain(backend)
	if err := auth.NewStore(testKeychain).Save(raw); err != nil {
		t.Fatalf("seed token: %v", err)
	}

	loginCalls := 0
	err := runWithDeps(
		[]string{"config", "envvar", "get", "help", "--app", "example", "--env", "develop"},
		runDeps{
			Tracker:     &telemetry.Tracker{Disabled: true},
			NewKeychain: func(string) *keychain.Keychain { return testKeychain },
			NewLogin: func(*auth.Store) func() (*auth.Token, error) {
				return func() (*auth.Token, error) {
					loginCalls++
					return nil, auth.ErrLoginCancelled
				}
			},
		})
	if err != nil {
		t.Fatalf("`config envvar get help` must run like any other command; got %v", err)
	}
	if loginCalls != 0 {
		t.Fatalf("login flow ran %d times; a valid stored token must never trigger it", loginCalls)
	}
	if !rec.saw("ResolveAppByName") {
		t.Errorf("app was never resolved — the GraphQL client was not configured (ops=%v)", rec.ops)
	}
	if !rec.saw("GetEnvironmentVariablesWithValues") {
		t.Errorf("the envvar query never ran (ops=%v)", rec.ops)
	}
	for _, got := range rec.auth {
		if got != "Bearer "+raw {
			t.Errorf("Authorization = %q, want the stored token", got)
		}
	}
}

// TestHelpWithoutStoredTokenStillSkipsLogin pins the half of Node's rule that
// must NOT regress: --help with an empty keychain prints help and never opens a
// login prompt (vip.js:204-212, isHelpCommand short-circuits the login branch).
func TestHelpWithoutStoredTokenStillSkipsLogin(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "1")
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	t.Setenv("WPVIP_DEPLOY_TOKEN", "")
	t.Setenv("API_HOST", "http://127.0.0.1:1")

	backend := &bootstrapBackend{}
	testKeychain := newBootstrapKeychain(backend)
	loginCalls := 0
	err := runWithDeps([]string{"--help"}, runDeps{
		Tracker:     &telemetry.Tracker{Disabled: true},
		NewKeychain: func(string) *keychain.Keychain { return testKeychain },
		NewLogin: func(*auth.Store) func() (*auth.Token, error) {
			return func() (*auth.Token, error) {
				loginCalls++
				return nil, auth.ErrLoginCancelled
			}
		},
	})
	if err != nil {
		t.Fatalf("--help must exit 0 without a token; got %v", err)
	}
	if loginCalls != 0 {
		t.Fatalf("--help triggered the login flow %d times", loginCalls)
	}
}

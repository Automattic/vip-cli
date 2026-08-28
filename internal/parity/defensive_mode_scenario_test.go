//go:build parity

package parity

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

// TestDefensiveModeEnableWithRechallenge is the M3 acceptance scenario.
//
// Single mux serves both /graphql (GraphQL) and /parker/* (Parker REST) so
// rechallenge.Client can resolve relative Parker paths against the same API
// host. First mutation hit returns elevated-permission-required; the runner
// completes step-up against the Parker mock; second mutation hit succeeds
// with the elevated header attached.
//
// This test runs the actual vip-next Go binary end-to-end (not just the
// in-process middleware), which is what makes it the acceptance gate for M3.
func TestDefensiveModeEnableWithRechallenge(t *testing.T) {
	read := func(name string) []byte {
		b, err := os.ReadFile("../../testdata/parity/recordings/defensive-mode-enable-rechallenge/" + name)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		return b
	}
	mutationElevated := read("mutation-elevated.json")
	mutationSuccess := read("mutation-success.json")
	createSession := read("parker-create-session.json")
	statusVerified := read("parker-status-verified.json")
	exchange := read("parker-exchange.json")

	mutationHits := int32(0)
	unauthenticatedParkerHits := int32(0)
	var headerOnRetry string
	var expectedAuthorization string
	requirePrimaryAuth := func(w http.ResponseWriter, r *http.Request) bool {
		if r.Header.Get("Authorization") == expectedAuthorization {
			return true
		}
		atomic.AddInt32(&unauthenticatedParkerHits, 1)
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"missing primary token"}`))
		return false
	}

	// Fixture for the M4 ResolveAppByName lookup that WithAppContext fires
	// before the mutation. App id=42 named "parityapp" with a develop env
	// of id=7 — matches the rest of the scenario (env=develop, env id 7
	// referenced in mutation-elevated/-success bodies).
	resolveAppByNameBody := []byte(`{"data":{"apps":{"edges":[{"id":42,"name":"parityapp","environments":[{"id":7,"name":"develop","type":"develop","defaultDomain":"d.example"}]}]}}}`)

	mux := http.NewServeMux()
	mux.HandleFunc("/graphql", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(s, `"operationName":"ResolveAppByName"`) ||
			strings.Contains(s, `"operationName":"ResolveAppByID"`) {
			w.Write(resolveAppByNameBody)
			return
		}
		// Mutation path: first hit returns elevated-required, second hit
		// (after step-up + retry) returns success.
		n := atomic.AddInt32(&mutationHits, 1)
		if n == 1 {
			w.Write(mutationElevated)
			return
		}
		headerOnRetry = r.Header.Get("x-elevated-token")
		w.Write(mutationSuccess)
	})
	mux.HandleFunc("/parker/sessions", func(w http.ResponseWriter, r *http.Request) {
		if !requirePrimaryAuth(w, r) {
			return
		}
		w.Write(createSession)
	})
	mux.HandleFunc("/parker/sessions/c1", func(w http.ResponseWriter, r *http.Request) {
		if !requirePrimaryAuth(w, r) {
			return
		}
		w.Write(statusVerified)
	})
	mux.HandleFunc("/parker/sessions/c1/exchange", func(w http.ResponseWriter, r *http.Request) {
		if !requirePrimaryAuth(w, r) {
			return
		}
		w.Write(exchange)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	scenario, err := LoadScenario("../../testdata/parity/defensive-mode-enable-with-rechallenge.yaml")
	if err != nil {
		t.Fatalf("LoadScenario: %v", err)
	}
	if scenario.Env == nil {
		scenario.Env = map[string]string{}
	}
	scenario.Env["API_HOST"] = srv.URL
	token := makeTestToken(t)
	expectedAuthorization = "Bearer " + token
	scenario.Env["VIP_TOKEN_OVERRIDE"] = token

	goBin := buildVipNextWithVersion(t, "test", "test")
	res, err := Run(RunSpec{Binary: goBin, Argv: scenario.Argv, Env: FixtureEnv(scenario.Env)})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.ExitCode != 0 {
		t.Errorf("exit = %d, want 0; stderr=%s; stdout=%s", res.ExitCode, res.Stderr, res.Stdout)
	}
	if mutationHits != 2 {
		t.Errorf("mutation hits = %d, want 2 (elevated bounce + replay)", mutationHits)
	}
	if headerOnRetry != "elev-token-xyz" {
		t.Errorf("retry header = %q, want elev-token-xyz", headerOnRetry)
	}
	if unauthenticatedParkerHits != 0 {
		t.Errorf("unauthenticated Parker hits = %d, want 0", unauthenticatedParkerHits)
	}
	if !strings.Contains(res.Stdout, "Defensive mode enabled for parityapp.develop") {
		t.Errorf("stdout missing success line; got=%q", res.Stdout)
	}
}

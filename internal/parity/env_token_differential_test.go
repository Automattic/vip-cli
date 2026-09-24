//go:build parity

package parity

import (
	"encoding/base64"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	json "encoding/json/v2"
)

func environmentFixtureToken(t *testing.T, claims map[string]any) string {
	t.Helper()
	header, err := json.Marshal(map[string]any{"alg": "none", "typ": "JWT"})
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	enc := base64.RawURLEncoding
	return enc.EncodeToString(header) + "." + enc.EncodeToString(payload) + "."
}

func validEnvironmentFixtureToken(t *testing.T) string {
	t.Helper()
	return environmentFixtureToken(t, map[string]any{
		"id": 84, "iat": time.Now().Add(-time.Hour).Unix(), "exp": time.Now().Add(time.Hour).Unix(),
	})
}

func TestEnvironmentPATNodeGoParity(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestEnvironmentPATNodeGoParity", skip))
	}
	response, err := os.ReadFile("../../testdata/parity/recordings/whoami-baseline/me-response.json")
	if err != nil {
		t.Fatal(err)
	}
	var authorizations []string
	rig.serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorizations = append(authorizations, r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(response)
	}))

	scenario, err := LoadScenario("../../testdata/parity/env-token-whoami.yaml")
	if err != nil {
		t.Fatal(err)
	}
	envPAT := validEnvironmentFixtureToken(t)
	scenario.Env = rig.scenarioEnv(scenario)
	scenario.Env["VIP_CLI_TOKEN"] = envPAT
	// Go's test-only override and Node's seeded store contain a different PAT.
	scenario.Env["VIP_TOKEN_OVERRIDE"] = rig.token
	diff, err := CompareBinaries(scenario, rig.nodeBin, rig.goBin)
	if err != nil {
		t.Fatal(err)
	}
	if !diff.Equal {
		t.Fatalf("Node vs Go diverge: exit=%s stdout=%s stderr=%s", diff.ExitCodeDelta, diff.StdoutDelta, diff.StderrDelta)
	}
	if len(authorizations) != 2 || authorizations[0] != "Bearer "+envPAT || authorizations[1] != "Bearer "+envPAT {
		t.Fatalf("API Authorization headers did not use the environment PAT in both runtimes: %d requests", len(authorizations))
	}
}

func TestEnvironmentPATInvalidFailsWithoutRequest(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestEnvironmentPATInvalidFailsWithoutRequest", skip))
	}
	cases := map[string]string{
		"malformed":  "not-a-jwt",
		"missing-id": environmentFixtureToken(t, map[string]any{"iat": time.Now().Add(-time.Minute).Unix()}),
		"expired":    environmentFixtureToken(t, map[string]any{"id": 84, "iat": time.Now().Add(-2 * time.Hour).Unix(), "exp": time.Now().Add(-time.Hour).Unix()}),
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			requests := 0
			rig.serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests++ }))
			env := FixtureEnv(map[string]string{
				"API_HOST": rig.srv.URL, "VIP_CLI_TOKEN": raw,
				"VIP_TOKEN_OVERRIDE": rig.token,
			})
			for _, bin := range []string{rig.nodeBin, rig.goBin} {
				result, err := Run(RunSpec{Binary: bin, Argv: []string{"whoami"}, Env: env})
				if err != nil {
					t.Fatal(err)
				}
				if result.ExitCode == 0 || !strings.Contains(result.Stderr+result.Stdout, "VIP_CLI_TOKEN") {
					t.Fatalf("%s accepted invalid environment PAT: exit=%d stdout=%q stderr=%q", bin, result.ExitCode, result.Stdout, result.Stderr)
				}
			}
			if requests != 0 {
				t.Fatalf("invalid environment PAT caused %d API requests", requests)
			}
		})
	}
}

func TestEnvironmentPATLogoutDoesNotRevokeStoredSession(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestEnvironmentPATLogoutDoesNotRevokeStoredSession", skip))
	}
	logoutRequests := 0
	rig.serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/logout" {
			logoutRequests++
		}
	}))
	env := FixtureEnv(map[string]string{
		"API_HOST": rig.srv.URL, "VIP_CLI_TOKEN": validEnvironmentFixtureToken(t),
		"VIP_TOKEN_OVERRIDE": rig.token,
	})
	for _, bin := range []string{rig.nodeBin, rig.goBin} {
		result, err := Run(RunSpec{Binary: bin, Argv: []string{"logout"}, Env: env})
		if err != nil {
			t.Fatal(err)
		}
		if result.ExitCode != 0 || !strings.Contains(result.Stdout, "VIP_CLI_TOKEN") {
			t.Fatalf("%s logout: exit=%d stdout=%q stderr=%q", bin, result.ExitCode, result.Stdout, result.Stderr)
		}
	}
	if logoutRequests != 0 {
		t.Fatalf("environment logout revoked a server-side token %d times", logoutRequests)
	}
}

func TestEnvironmentPATLoginRequiresUnset(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestEnvironmentPATLoginRequiresUnset", skip))
	}
	env := FixtureEnv(map[string]string{
		"API_HOST": rig.srv.URL, "VIP_CLI_TOKEN": validEnvironmentFixtureToken(t),
	})
	for _, bin := range []string{rig.nodeBin, rig.goBin} {
		result, err := Run(RunSpec{Binary: bin, Argv: []string{"login"}, Env: env})
		if err != nil {
			t.Fatal(err)
		}
		if result.ExitCode == 0 || !strings.Contains(result.Stderr+result.Stdout, "Unset") {
			t.Fatalf("%s login: exit=%d stdout=%q stderr=%q", bin, result.ExitCode, result.Stdout, result.Stderr)
		}
	}
}

func TestEnvironmentPATInvalidDoesNotBlockHelp(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestEnvironmentPATInvalidDoesNotBlockHelp", skip))
	}
	env := FixtureEnv(map[string]string{
		"API_HOST": rig.srv.URL, "VIP_CLI_TOKEN": "not-a-jwt",
	})
	for _, bin := range []string{rig.nodeBin, rig.goBin} {
		result, err := Run(RunSpec{Binary: bin, Argv: []string{"--help"}, Env: env})
		if err != nil {
			t.Fatal(err)
		}
		if result.ExitCode != 0 || !strings.Contains(result.Stdout, "Usage") {
			t.Fatalf("%s help: exit=%d stdout=%q stderr=%q", bin, result.ExitCode, result.Stdout, result.Stderr)
		}
	}
}

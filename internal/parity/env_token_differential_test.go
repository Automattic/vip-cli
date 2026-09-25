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
	rig.ensureStoredCredentials(t)
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
	// Both stored credentials contain a different PAT.
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
	rig.ensureStoredCredentials(t)
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
	rig.ensureStoredCredentials(t)
	logoutRequests := 0
	rig.serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/logout" {
			logoutRequests++
		}
	}))
	env := FixtureEnv(map[string]string{
		"API_HOST": rig.srv.URL, "VIP_CLI_TOKEN": validEnvironmentFixtureToken(t),
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
	// Clearing the environment source must reveal the original stored session.
	if err := goKeychainOp(rig.srv.URL, "verify", rig.token); err != nil {
		t.Fatal(err)
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
	for _, bin := range []string{rig.nodeBin, rig.goBin} {
		result, err := Run(RunSpec{Binary: bin, Argv: []string{"whoami"}, Env: FixtureEnv(map[string]string{
			"API_HOST": rig.srv.URL, "VIP_CLI_TOKEN": "",
		})})
		if err != nil {
			t.Fatal(err)
		}
		if result.ExitCode != 0 {
			t.Fatalf("stored session after environment logout: exit=%d stderr=%q", result.ExitCode, result.Stderr)
		}
	}
	if len(authorizations) != 2 || authorizations[0] != "Bearer "+rig.token || authorizations[1] != "Bearer "+rig.token {
		t.Fatalf("original stored sessions were not reused by both runtimes (%d requests)", len(authorizations))
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

func TestEnvironmentPATInvalidBypassedCommandDoesNotRequest(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestEnvironmentPATInvalidBypassedCommandDoesNotRequest", skip))
	}
	requests := 0
	rig.serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.WriteHeader(http.StatusUnauthorized)
	}))
	for _, bin := range []string{rig.nodeBin, rig.goBin} {
		result, err := Run(RunSpec{Binary: bin,
			Argv: []string{"config", "envvar", "get", "help", "--app", "example", "--env", "develop"},
			Env:  FixtureEnv(map[string]string{"API_HOST": rig.srv.URL, "VIP_CLI_TOKEN": "not-a-jwt"}),
		})
		if err != nil {
			t.Fatal(err)
		}
		if result.ExitCode == 0 || !strings.Contains(result.Stderr+result.Stdout, "VIP_CLI_TOKEN") {
			t.Errorf("%s: exit=%d stdout=%q stderr=%q; want environment PAT error", bin, result.ExitCode, result.Stdout, result.Stderr)
		}
	}
	if requests != 0 {
		t.Fatalf("invalid environment PAT caused %d API requests", requests)
	}
}

// Stdin declines browser opening. The assertion covers entry into the login
// flow; completing interactive login is covered by the runtime unit tests.
func TestStoredPATExplicitLoginStartsFlow(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestStoredPATExplicitLoginStartsFlow", skip))
	}
	rig.ensureStoredCredentials(t)
	for _, bin := range []string{rig.nodeBin, rig.goBin} {
		result, err := Run(RunSpec{Binary: bin, Argv: []string{"login"}, Stdin: []byte("n\n"),
			Env: FixtureEnv(map[string]string{"API_HOST": rig.srv.URL, "VIP_CLI_TOKEN": ""}),
		})
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(result.Stdout, "Authenticate your installation") || strings.Contains(result.Stderr, "not a valid subcommand") {
			t.Fatalf("%s did not start explicit login with a stored PAT: exit=%d stdout=%q stderr=%q", bin, result.ExitCode, result.Stdout, result.Stderr)
		}
	}
}

func TestEnvironmentPATInvalidDoesNotBlockVersionOrLogout(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestEnvironmentPATInvalidDoesNotBlockVersionOrLogout", skip))
	}
	for _, tc := range []struct{ arg, want string }{{"--version", ""}, {"logout", "VIP_CLI_TOKEN"}} {
		for _, bin := range []string{rig.nodeBin, rig.goBin} {
			result, err := Run(RunSpec{Binary: bin, Argv: []string{tc.arg},
				Env: FixtureEnv(map[string]string{"API_HOST": rig.srv.URL, "VIP_CLI_TOKEN": "not-a-jwt"}),
			})
			if err != nil {
				t.Fatal(err)
			}
			if result.ExitCode != 0 || strings.TrimSpace(result.Stdout) == "" || !strings.Contains(result.Stdout, tc.want) {
				t.Fatalf("%s %s: exit=%d stdout=%q stderr=%q", bin, tc.arg, result.ExitCode, result.Stdout, result.Stderr)
			}
		}
	}
}

func TestUnauthorizedCredentialSourceNodeGoParity(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestUnauthorizedCredentialSourceNodeGoParity", skip))
	}
	rig.ensureStoredCredentials(t)
	for _, source := range []struct {
		name, raw   string
		environment bool
	}{
		{"environment", validEnvironmentFixtureToken(t), true},
		{"stored", "", false},
	} {
		t.Run(source.name, func(t *testing.T) {
			for _, response := range []struct{ name, body, reason string }{
				{"json", `{}`, "You are not authorized to perform this request"},
				{"non-json", `not-json`, "You are not authorized to perform this request"},
				{"inactivity", `{"code":"token-disabled-inactivity"}`, "Your token has expired due to inactivity"},
			} {
				t.Run(response.name, func(t *testing.T) {
					requests := 0
					rig.serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						requests++
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusUnauthorized)
						_, _ = w.Write([]byte(response.body))
					}))
					var previous string
					for _, bin := range []string{rig.nodeBin, rig.goBin} {
						result, err := Run(RunSpec{Binary: bin, Argv: []string{"whoami"}, Env: FixtureEnv(map[string]string{
							"API_HOST": rig.srv.URL, "VIP_CLI_TOKEN": source.raw,
						})})
						if err != nil {
							t.Fatal(err)
						}
						if result.ExitCode != 1 || result.Stdout != "" || !strings.Contains(result.Stderr, response.reason) {
							t.Fatalf("%s: exit=%d stdout=%q stderr=%q", bin, result.ExitCode, result.Stdout, result.Stderr)
						}
						if source.environment {
							if !strings.Contains(result.Stderr, "replace the token in VIP_CLI_TOKEN") || !strings.Contains(result.Stderr, "unset VIP_CLI_TOKEN") || strings.Contains(result.Stderr, "vip logout") {
								t.Fatalf("wrong environment recovery guidance: %q", result.Stderr)
							}
						} else if !strings.Contains(result.Stderr, "vip logout") || strings.Contains(result.Stderr, "VIP_CLI_TOKEN") {
							t.Fatalf("wrong stored recovery guidance: %q", result.Stderr)
						}
						// Apply the harness's existing platform-noise rules before comparing auth errors.
						stderr, err := normalizeStderr(result.Stderr, nil)
						if err != nil {
							t.Fatal(err)
						}
						if previous != "" && previous != stderr {
							t.Fatalf("Node and Go 401 messages differ: %q != %q", previous, stderr)
						}
						previous = stderr
					}
					if requests != 2 {
						t.Fatalf("401 was retried: got %d requests, want one per runtime", requests)
					}
				})
			}
		})
	}
}

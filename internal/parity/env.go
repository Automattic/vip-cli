//go:build parity

package parity

import (
	"encoding/base64"
	"os"
	"sort"
	"strings"
	"time"

	json "encoding/json/v2"
)

// FixtureAPIHost is the API host every fixture subprocess gets unless the
// scenario points it at its own httptest server. Port 1 on loopback is
// closed on every supported platform, so a scenario that forgets to stand up
// a mock fails with a connection error instead of quietly talking to the
// real production API with whatever credential happened to be lying around.
const FixtureAPIHost = "http://127.0.0.1:1"

// fixtureTokenUserID is the `id` claim in FixtureToken. Scenario tests that
// mint their own token use the same id so recordings stay interchangeable.
const fixtureTokenUserID = 42

// scenarioEnvPassthrough is the ONLY set of parent variables carried into a
// fixture subprocess. Everything else — credentials, API hosts, proxies,
// XDG overrides, DEBUG namespaces, colour knobs — is dropped, because the
// suite must produce identical results on a developer laptop with live
// credentials and in a bare CI container with none.
//
// Keep this list to variables the operating system and the language runtimes
// need in order to start a process at all. If a scenario needs anything else,
// it sets it explicitly.
var scenarioEnvPassthrough = []string{
	// POSIX process basics. PATH is required for the `#!/usr/bin/env node`
	// shebang on the Node binary; HOME for per-user config/credential lookup.
	"PATH",
	"HOME",
	"TMPDIR",
	"TMP",
	"TEMP",
	"USER",
	"LOGNAME",
	"SHELL",
	"LANG",
	"LC_ALL",

	// Windows equivalents: without these a child process cannot resolve
	// system DLLs, the user profile, or executable extensions.
	"SystemRoot",
	"SystemDrive",
	"ComSpec",
	"PATHEXT",
	"USERPROFILE",
	"HOMEDRIVE",
	"HOMEPATH",
	"WINDIR",
	"APPDATA",
	"LOCALAPPDATA",
	"PROGRAMDATA",
	"ProgramFiles",
	"ProgramFiles(x86)",
}

// scenarioEnvPinned is the explicitly-constructed base. These values are the
// same on every machine; a scenario's own Env map overrides any of them.
//
//   - API_HOST      dead loopback (see FixtureAPIHost)
//   - VIP_TOKEN_OVERRIDE  a deterministic fake JWT that authenticates the GO
//     binary without touching the host keychain. It does nothing for Node and
//     never did: the variable has never existed upstream (`git log --all -S` on
//     Automattic/vip returns zero commits), Token.get() reads getKeychain() and
//     nothing else. Scenarios that run the real Node binary seed a credential
//     instead — see keychain.go and differential_test.go. Keeping the override
//     here is what stops the ~50 mock-only scenarios from having to write
//     credentials at all.
//   - NODE_ENV/GO_ENV     test mode: suppresses Node's update-notifier network
//     call, and is the gate Go still applies to the token override
//     (internal/auth/store.go tokenOverride).
//   - DO_NOT_TRACK        no telemetry from either CLI. Note this does NOT stop
//     Node from creating its "<service>-uuid" keychain entry: trackEvent calls
//     Token.uuid() (src/lib/tracker.ts:55) before any opt-out check, which is
//     why that name is in ParityKeychainServices.
func scenarioEnvPinned() map[string]string {
	return map[string]string{
		"API_HOST":           FixtureAPIHost,
		"VIP_TOKEN_OVERRIDE": FixtureToken(),
		"NODE_ENV":           "test",
		"GO_ENV":             "test",
		"DO_NOT_TRACK":       "1",
	}
}

// ScenarioEnv builds the environment for a fixture-suite subprocess.
//
// It is the fixture-suite counterpart of BuildParkerEnv: a scrubbed,
// explicitly-constructed base rather than an inherited one. Composition order
// is passthrough allowlist → pinned base → caller overrides, so a scenario can
// always win.
//
// Pass os.Environ() as parent. Anything not in scenarioEnvPassthrough and not
// in the pinned base is ABSENT from the result — absence, not an empty value,
// because the CLIs use LookupEnv-style presence checks in places.
func ScenarioEnv(parent []string, overrides map[string]string) []string {
	pinned := scenarioEnvPinned()

	allow := make(map[string]bool, len(scenarioEnvPassthrough))
	for _, key := range scenarioEnvPassthrough {
		allow[key] = true
	}

	out := make(map[string]string, len(allow)+len(pinned)+len(overrides))
	for _, kv := range parent {
		key, value, ok := strings.Cut(kv, "=")
		if !ok || !allow[key] {
			continue
		}
		out[key] = value
	}
	for key, value := range pinned {
		out[key] = value
	}
	for key, value := range overrides {
		out[key] = value
	}

	keys := make([]string, 0, len(out))
	for key := range out {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	env := make([]string, 0, len(keys))
	for _, key := range keys {
		env = append(env, key+"="+out[key])
	}
	return env
}

// FixtureEnv is the call-site form of ScenarioEnv: it takes the real process
// environment as the parent and applies the scenario's overrides.
//
// Every fixture scenario builds its subprocess environment through this
// function. os.Environ() must not appear anywhere else in the package —
// TestNoAmbientEnvInheritanceInScenarios enforces that, because a single bare
// os.Environ() re-opens the hole where the suite passes on a laptop with live
// credentials and fails in a bare CI container.
func FixtureEnv(overrides map[string]string) []string {
	return ScenarioEnv(os.Environ(), overrides)
}

// FixtureToken mints the deterministic credential pinned into every fixture
// subprocess: an unsigned JWT with a fixed user id and a one-hour validity
// window. Both CLIs only decode the payload (they never verify the
// signature), so this is enough to get past the auth wall without touching a
// keychain or a real API.
//
// The exp claim is relative to now, so the token cannot rot in the repo.
func FixtureToken() string {
	now := time.Now()
	header, err := json.Marshal(map[string]any{"alg": "none", "typ": "JWT"})
	if err != nil {
		return ""
	}
	claims, err := json.Marshal(map[string]any{
		"id":  fixtureTokenUserID,
		"iat": now.Add(-time.Hour).Unix(),
		"exp": now.Add(time.Hour).Unix(),
	})
	if err != nil {
		return ""
	}
	enc := base64.RawURLEncoding
	return enc.EncodeToString(header) + "." + enc.EncodeToString(claims) + "."
}

//go:build parity

package parity

// Keychain plumbing for the Node-vs-Go differential scenario.
//
// WHY THIS EXISTS
//
// The Node CLI has NEVER had an environment escape hatch for credentials.
// `Token.get()` reads the OS credential store and nothing else, so the only way
// to put an identity in front of the real Node binary is to write a real
// keychain entry.
//
// An earlier version of this comment said Node 4.1.0 "removed
// VIP_TOKEN_OVERRIDE". That was wrong. The variable never existed upstream:
// `git log --all -S VIP_TOKEN_OVERRIDE` on Automattic/vip returns ZERO commits.
// It had been hand-injected into this repo's vendored copy of
// src/lib/token.ts (4 lines, gated on NODE_ENV=test) so that the harness would
// authenticate — i.e. the reference implementation was edited to make the test
// pass. The 4.0.4 -> trunk sync deleted that local edit, which is what made the
// differential start failing. Do not reintroduce it.
//
// DOES THIS WORK IN CI?
//
// Yes, and it was measured rather than assumed. Node picks its backend at
// runtime: getKeychain() (src/lib/keychain.ts:12-23) constructs Secure, probes
// it with a throwaway getPassword, and falls back to Insecure — a configstore
// JSON file under $XDG_CONFIG_HOME/configstore/vip-go-cli.json — if anything
// throws. On linux/amd64 with node:22, exercising the REAL vendored
// dist/lib/keychain.js:
//
//   - without libsecret: `require('@github/keytar')` throws at load in ~30ms;
//   - with libsecret-1-0 installed and no D-Bus session (the shape of a GitHub
//     Actions runner): the module loads, and the probe REJECTS in ~82ms with
//     "Cannot spawn a message bus without a machine-id".
//
// Both land on Insecure, both in well under a second, and neither hangs. A
// seed written by one process was then read back by a SEPARATE process — which
// is exactly the harness/CLI split — and deleted cleanly, leaving the store
// file empty.
//
// That is why the shim below drives getKeychain() instead of a backend: the
// credential lands wherever the CLI will look for it, on every platform,
// without the harness having to know which backend won. nodeKeychainOpTimeout
// covers the remaining unknown — a future backend that blocks instead of
// throwing becomes a loud skip, not a hung CI job.
//
// WHY THAT IS SAFE HERE
//
// Node derives its service name from API_HOST (Token.getServiceName,
// src/lib/token.ts:119-129). The differential pins API_HOST to an httptest
// server on 127.0.0.1 with an ephemeral port, so every run gets a service name
// that no human ever typed and that cannot collide with a real credential.
// Every keychain operation in this file asserts that property FIRST
// (assertEphemeralParityService) — a positive match, not a denylist. A name
// like "vip-go-cli" or "vip-go-cli:http---localhost-4000" is refused outright.
//
// A previous incarnation of this pattern left 727 orphaned entries behind, so
// there are three nets. First, the whole test binary shares ONE credential
// (differential_test.go): the number a run creates is a constant, not a
// function of how many scenarios exist. Second, TestMain tears that credential
// down after m.Run() whether the suite passed, failed or panicked. Third, a
// pre-run and a post-run sweep collect anything a killed run stranded and
// anything the CLIs under test wrote for themselves (see keychain_test.go).
//
// NOTHING IN THIS FILE EVER PRINTS A SECRET. Tokens travel to the node shim on
// stdin (never argv, never the environment), the shim redacts the secret out of
// any error message it emits, and enumeration uses `security dump-keychain`
// WITHOUT -d so no password material is ever decrypted or displayed.

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/rechallenge"
)

// nodeKeychainService is Node's SERVICE constant (src/lib/token.ts:14).
const nodeKeychainService = "vip-go-cli"

// nodeProductionAPIHost is Node's PRODUCTION_API_HOST
// (src/lib/api/constants.ts:1). Node omits the host suffix for this endpoint.
const nodeProductionAPIHost = "https://api.wpvip.com"

// nodeNonAlphanumeric mirrors Node's API_HOST.replace(/[^a-z0-9]/gi, '-')
// (src/lib/token.ts:123). The /i flag makes it case-insensitive, so uppercase
// letters survive — the class below is spelled out rather than folded.
var nodeNonAlphanumeric = regexp.MustCompile(`[^a-zA-Z0-9]`)

// NodeKeychainService reproduces Token.getServiceName (src/lib/token.ts:119-129)
// exactly:
//
//	let service = SERVICE;                                  // 'vip-go-cli'
//	if ( PRODUCTION_API_HOST !== API_HOST ) {
//	    const sanitized = API_HOST.replace( /[^a-z0-9]/gi, '-' );
//	    service = `${ SERVICE }:${ sanitized }`;
//	}
//	return `${ service }${ modifier }`;
//
// modifier is "" for the token entry and "-uuid" for the analytics anon-id
// entry that Token.uuid() creates (src/lib/token.ts:82).
//
// Note there is deliberately NO trailing-slash normalisation: Node does not do
// any, so neither does this. Go's own keychain.ServiceNameForHost DOES trim a
// trailing slash, which is a (harmless here, real elsewhere) divergence.
func NodeKeychainService(apiHost, modifier string) string {
	service := nodeKeychainService
	if apiHost != nodeProductionAPIHost {
		service = nodeKeychainService + ":" + nodeNonAlphanumeric.ReplaceAllString(apiHost, "-")
	}
	return service + modifier
}

// minEphemeralPort is the low-water mark of the ephemeral port range across the
// platforms this suite runs on: Linux starts at 32768, macOS and Windows at
// 49152. An httptest server (net.Listen on 127.0.0.1:0) always lands at or
// above this; a service name a human configured — a local Parker on :4000, the
// dead-loopback :1, the hostile-env :9 — never does.
const minEphemeralPort = 32768

// ephemeralParityServiceRe is the POSITIVE assertion that gates every keychain
// write and delete in this package. A service name must be:
//
//   - one of the two CLI namespaces (vip-go-cli for Node, vip-next-cli for Go),
//   - optionally the Go elevated-token namespace (":elevated"),
//   - scoped to a host, and that host must be exactly http://127.0.0.1:<port>
//     sanitised to http---127-0-0-1-<port> — "localhost" is NOT accepted,
//   - optionally suffixed "-uuid" (Node's analytics anon-id entry).
//
// The port is then range-checked against minEphemeralPort. Both conditions must
// hold; there is no denylist anywhere and no way to opt a name past this.
var ephemeralParityServiceRe = regexp.MustCompile(
	`^vip-(?:go|next)-cli(?::elevated)?:http---127-0-0-1-([0-9]{1,5})(?:-uuid)?$`)

// IsEphemeralParityService reports whether name is a credential this harness is
// permitted to create and destroy.
//
// It refuses, among everything else, all of these real credentials:
//
//	vip-go-cli                                (no host scope)
//	vip-go-cli-uuid                           (no host scope)
//	vip-next-cli-uuid                         (no host scope)
//	vip-go-cli:http---127-0-0-1-4000-uuid     (port 4000 < 32768)
//	vip-go-cli:http---localhost-4000          (host is not 127.0.0.1)
//	vip-go-cli:http---localhost-4000-uuid     (host is not 127.0.0.1)
//	vip-go-cli:http---127-0-0-1-9-uuid        (port 9 < 32768)
//	vip-next-cli:http---127-0-0-1-9-uuid      (port 9 < 32768)
func IsEphemeralParityService(name string) bool {
	m := ephemeralParityServiceRe.FindStringSubmatch(name)
	if m == nil {
		return false
	}
	port, err := strconv.Atoi(m[1])
	if err != nil {
		return false
	}
	return port >= minEphemeralPort && port <= 65535
}

// assertEphemeralParityService is the guard every mutating call runs first.
func assertEphemeralParityService(op, name string) error {
	if IsEphemeralParityService(name) {
		return nil
	}
	return fmt.Errorf(
		"parity keychain: refusing to %s %q — only credentials scoped to an ephemeral "+
			"loopback port (vip-{go,next}-cli[:elevated]:http---127-0-0-1-<port>[-uuid], "+
			"port >= %d) may be touched by the harness",
		op, name, minEphemeralPort)
}

// ErrKeychainUnsupported is returned by the /usr/bin/security-backed
// enumeration and deletion helpers on platforms that do not have it.
//
// It does NOT mean the differential cannot run there. Seeding and deleting go
// through Node's own keychain layer (see nodeKeychainScript) and work
// everywhere Node does; this error only marks the macOS-specific ORPHAN SWEEP
// as unavailable. Callers must therefore treat it as "nothing to sweep", never
// as a failure and never as a reason to skip a scenario.
//
// The asymmetry that leaves behind, stated plainly: on macOS a run killed
// mid-flight (SIGKILL, ^C) leaves a keychain item that the next run's pre-run
// sweep collects. On Linux the equivalent orphan is one JSON key inside
// ~/.config/configstore/vip-go-cli.json, and there is no sweep for it — the
// key is removed by the normal teardown, but not recovered if the process is
// killed before teardown. That is deliberate: enumerating configstore means
// reaching into a private field of the vendored Insecure backend, and the
// exposure it would buy back is one key on a CI runner that is destroyed at
// the end of the job.
var ErrKeychainUnsupported = errors.New(
	"parity keychain: the orphan sweep is only implemented on macOS")

const securityBin = "/usr/bin/security"

// ParityKeychainServices lists every service name a differential run against
// apiHost can bring into existence — the set that must be cleaned up.
//
// Two are Node's (src/lib/token.ts): the token entry the harness seeds, and the
// "-uuid" analytics entry Token.uuid() creates on its own. trackEvent() calls
// Token.uuid() unconditionally (src/lib/tracker.ts:55), BEFORE the DO_NOT_TRACK
// check further down the stack, so that entry appears even with telemetry off.
//
// Two are Go's, taken from the production derivations so they cannot drift:
// the auth store's entry and the rechallenge elevated-token cache.
func ParityKeychainServices(apiHost string) []string {
	return []string{
		NodeKeychainService(apiHost, ""),
		NodeKeychainService(apiHost, "-uuid"),
		keychain.ServiceNameForHost(apiHost),
		rechallenge.ServiceNameForHost(apiHost),
	}
}

// nodeKeychainScript drives NODE'S OWN keychain layer — dist/lib/keychain.js,
// the compiled src/lib/keychain.ts — rather than reaching for a backend
// directly.
//
// That indirection is the whole point. getKeychain() tries Secure (keytar) and
// falls back to Insecure (a configstore JSON file) when Secure throws
// (src/lib/keychain.ts:12-23). Which one wins depends on the host: macOS gets
// Secure, a headless Linux CI runner with no usable secret service gets
// Insecure. Seeding through the same function the CLI reads through means the
// harness cannot write to a store the CLI will not consult — the seed lands
// wherever the read will look, by construction, on every platform.
//
// It also preserves the property the previous keytar-direct version had: an
// entry created by /usr/bin/security carries an ACL partition list of
// "apple-tool:" only, and a later read from node blocks on a GUI authorisation
// prompt. Writing through node gives the item the partition list node can read.
//
// The secret arrives on stdin — not argv (visible in ps) and not the
// environment. Every error message has the secret spliced out before it is
// printed, so a backend failure can never leak the token.
const nodeKeychainScript = `
const { getKeychain } = require(process.env.VIP_PARITY_KEYCHAIN_DIST + '/lib/keychain.js');
const service = process.env.VIP_PARITY_KEYCHAIN_SERVICE;
const op = process.env.VIP_PARITY_KEYCHAIN_OP;
const secret = op === 'set' ? require('node:fs').readFileSync(0, 'utf8') : '';
const redact = err => {
  const text = String((err && err.stack) || (err && err.message) || err);
  return secret ? text.split(secret).join('<redacted>') : text;
};
(async () => {
  const keychain = await getKeychain();
  if (op === 'delete') {
    await keychain.deletePassword(service);
    process.stdout.write('DELETED:' + keychain.constructor.name);
    return;
  }
  await keychain.setPassword(service, secret);
  const readBack = await keychain.getPassword(service);
  process.stdout.write((readBack === secret ? 'VERIFIED:' : 'MISMATCH:') + keychain.constructor.name);
})().catch(err => { process.stderr.write(redact(err)); process.exit(1); });
`

// nodeKeychainOpTimeout bounds every call into Node's keychain layer.
//
// On macOS the whole round trip is ~25ms and on a keytar-less host the
// Insecure fallback is ~15ms (both measured). The budget is enormous next to
// that on purpose: it exists solely so a credential backend that BLOCKS rather
// than throwing — libsecret waiting on a D-Bus session that will never
// autolaunch is the plausible Linux case — turns into a loud skip instead of a
// CI job that hangs until the runner's own timeout kills it.
const nodeKeychainOpTimeout = 60 * time.Second

// ErrKeychainSeedMismatch means the write reported success but the value read
// back was not the value written. That is a harness bug (a wrong service name,
// a wrong account), not a hostile environment, so callers should FAIL on it
// rather than skip.
var ErrKeychainSeedMismatch = errors.New(
	"parity keychain: seeded entry did not read back as written")

// SeedNodeKeychainToken writes token into the credential the Node CLI reads for
// apiHost, through Node's own keychain layer.
//
// The caller MUST register cleanup for ParityKeychainServices(apiHost) BEFORE
// calling this, so a partial write is still collected.
//
// A non-nil error other than ErrKeychainSeedMismatch means the credential store
// could not be driven at all (no node, no dist/, no usable backend, a locked
// keychain, a backend that timed out); the caller turns that into a loud skip.
func SeedNodeKeychainToken(nodeBin, apiHost, token string) error {
	service := NodeKeychainService(apiHost, "")
	if err := assertEphemeralParityService("write", service); err != nil {
		return err
	}
	if token == "" {
		return errors.New("parity keychain: refusing to seed an empty token")
	}
	out, err := runNodeKeychainOp(nodeBin, service, "set", token)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(out, "VERIFIED:") {
		return fmt.Errorf("%w: service %q (backend reported %q)", ErrKeychainSeedMismatch, service, out)
	}
	return nil
}

// DeleteNodeKeychainService removes name through Node's own keychain layer.
//
// This is the platform-portable half of cleanup: DeleteParityKeychainService
// below shells out to /usr/bin/security and therefore only exists on macOS,
// but on a Linux runner the credential lives in a configstore JSON file that
// only Node knows the path of. Deleting through getKeychain() removes exactly
// the key that was written, whichever backend holds it.
func DeleteNodeKeychainService(nodeBin, name string) error {
	if err := assertEphemeralParityService("delete", name); err != nil {
		return err
	}
	_, err := runNodeKeychainOp(nodeBin, name, "delete", "")
	return err
}

func runNodeKeychainOp(nodeBin, service, op, secret string) (string, error) {
	dist, err := nodeDistDir(nodeBin)
	if err != nil {
		return "", err
	}
	root, ok := nodeModulesRoot(nodeBin)
	if !ok {
		return "", fmt.Errorf("parity keychain: no node_modules above %s; run `npm ci`", nodeBin)
	}

	ctx, cancel := context.WithTimeout(context.Background(), nodeKeychainOpTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "node", "-e", nodeKeychainScript)
	cmd.Dir = root
	// The shim gets the scrubbed fixture environment plus the operands, and
	// explicitly NO credential: it receives the secret on stdin instead.
	cmd.Env = FixtureEnv(map[string]string{
		"VIP_PARITY_KEYCHAIN_DIST":    dist,
		"VIP_PARITY_KEYCHAIN_SERVICE": service,
		"VIP_PARITY_KEYCHAIN_OP":      op,
		"VIP_TOKEN_OVERRIDE":          "",
	})
	if secret != "" {
		cmd.Stdin = strings.NewReader(secret)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := cmd.Run()
	if ctx.Err() != nil {
		return "", fmt.Errorf("parity keychain: %s %q timed out after %s — the credential "+
			"backend blocked instead of failing", op, service, nodeKeychainOpTimeout)
	}
	if runErr != nil {
		return "", fmt.Errorf("parity keychain: node could not %s %q (%v): %s",
			op, service, runErr, strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

// nodeDistDir maps the CLI entrypoint to the compiled tree that holds
// lib/keychain.js (dist/bin/vip.js -> dist).
func nodeDistDir(binPath string) (string, error) {
	dist := filepath.Dir(filepath.Dir(binPath))
	if _, err := os.Stat(filepath.Join(dist, "lib", "keychain.js")); err != nil {
		return "", fmt.Errorf("parity keychain: %s has no lib/keychain.js "+
			"(derived from NODE_VIP_BIN=%s); run `npm ci`", dist, binPath)
	}
	return dist, nil
}

// nodeModulesRoot walks up from the Node entrypoint to the directory that owns
// node_modules (dist/bin/vip.js -> dist/bin -> dist -> <root>).
func nodeModulesRoot(binPath string) (string, bool) {
	dir := filepath.Dir(binPath)
	for {
		if info, err := os.Stat(filepath.Join(dir, "node_modules")); err == nil && info.IsDir() {
			return dir, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}

// DeleteParityKeychainService removes every credential stored under name.
//
// It deletes by SERVICE rather than by (service, account) on purpose: Go's auth
// store writes a second item under the same service with the account
// "<service>:legacy-fallback-disabled" (internal/auth/store.go:128), and a
// (service, account) delete would leave it behind. The service name itself is
// what the guard validates, so removing everything under it is bounded.
//
// A name that is already absent is not an error — cleanup must be idempotent.
func DeleteParityKeychainService(name string) error {
	if err := assertEphemeralParityService("delete", name); err != nil {
		return err
	}
	if runtime.GOOS != "darwin" {
		return ErrKeychainUnsupported
	}
	for {
		// No -g/-w: attributes only, so nothing is ever decrypted or printed.
		out, err := exec.Command(securityBin, "delete-generic-password", "-s", name).CombinedOutput()
		if err != nil {
			if strings.Contains(string(out), "could not be found") {
				return nil
			}
			return fmt.Errorf("parity keychain: delete %q: %v: %s",
				name, err, strings.TrimSpace(string(out)))
		}
	}
}

// CleanupParityKeychainServices deletes each name, guard first. It keeps going
// after a failure so one bad name cannot strand the rest, and returns the
// joined error.
func CleanupParityKeychainServices(names []string) error {
	var errs []error
	for _, name := range names {
		if err := DeleteParityKeychainService(name); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// CleanupParityCredentials removes every credential a differential run against
// apiHost can have created, on any platform.
//
// It runs BOTH deletion paths because they cover different ground:
//
//   - Node's own keychain layer knows where Node put the entry, which on a
//     host without a usable secret service is a configstore JSON file that
//     /usr/bin/security cannot see at all;
//   - /usr/bin/security deletes by SERVICE, which collects the SECOND item Go's
//     auth store writes under the same service with the account
//     "<service>:legacy-fallback-disabled" (internal/auth/store.go) — a
//     (service, account) delete through Node would leave that behind.
//
// ErrKeychainUnsupported from the macOS-only path is not an error: on Linux
// there is simply nothing for it to do. Everything else is reported, and the
// function keeps going so one failure cannot strand the rest.
func CleanupParityCredentials(nodeBin, apiHost string) error {
	var errs []error
	for _, name := range ParityKeychainServices(apiHost) {
		if nodeBin != "" {
			if err := DeleteNodeKeychainService(nodeBin, name); err != nil {
				errs = append(errs, err)
			}
		}
		if err := DeleteParityKeychainService(name); err != nil &&
			!errors.Is(err, ErrKeychainUnsupported) {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// svceLine matches the service attribute in `security dump-keychain` output:
//
//	    "svce"<blob>="vip-go-cli:http---127-0-0-1-63145-uuid"
var svceLine = regexp.MustCompile(`^\s*"svce"<blob>="(.*)"\s*$`)

// listKeychainServices enumerates the service names in the user's keychain
// search list.
//
// `security dump-keychain` WITHOUT -d dumps attributes only. It never decrypts
// a password and never prompts. Values that are not printable ASCII come back
// as 0x… hex instead of a quoted string and are simply not matched — every
// service name this harness cares about is plain ASCII.
func listKeychainServices() ([]string, error) {
	if runtime.GOOS != "darwin" {
		return nil, ErrKeychainUnsupported
	}
	// dump-keychain exits non-zero when any keychain in the search list is
	// unreadable while still dumping the rest, so a non-empty stdout wins over
	// the exit status.
	out, err := exec.Command(securityBin, "dump-keychain").Output()
	if len(out) == 0 && err != nil {
		return nil, fmt.Errorf("parity keychain: dump-keychain: %w", err)
	}

	var services []string
	seen := map[string]bool{}
	for _, line := range strings.Split(string(out), "\n") {
		m := svceLine.FindStringSubmatch(line)
		if m == nil || seen[m[1]] {
			continue
		}
		seen[m[1]] = true
		services = append(services, m[1])
	}
	return services, nil
}

// SweepEphemeralParityKeychain deletes every credential whose service name
// passes IsEphemeralParityService, and returns the names it removed.
//
// This is the orphan collector. A test binary that is killed (SIGKILL, a
// panicking child, ^C) never runs t.Cleanup, so entries survive; running this
// at the START of a run collects them, and running it at the END collects
// anything the CLIs under test wrote for themselves — the Go binary creates
// vip-next-cli:<host> and vip-next-cli:elevated:<host> entries during the login
// and rechallenge scenarios, which no per-test cleanup knows about.
//
// It cannot touch a real credential: a name only qualifies if it is scoped to
// 127.0.0.1 on a port in the ephemeral range, which is a shape only a
// throwaway httptest server produces.
func SweepEphemeralParityKeychain() ([]string, error) {
	services, err := listKeychainServices()
	if err != nil {
		return nil, err
	}
	var removed []string
	var errs []error
	for _, name := range services {
		if !IsEphemeralParityService(name) {
			continue
		}
		if err := DeleteParityKeychainService(name); err != nil {
			errs = append(errs, err)
			continue
		}
		removed = append(removed, name)
	}
	return removed, errors.Join(errs...)
}

//go:build devenv_e2e

// Package hostops e2e harness — the Plan 3 manual integration gate (Task 11).
//
// This is NOT a normal unit test: it drives the REAL proxy + hostops Go code
// against a live Docker daemon and performs the two host-privileged operations
// (trusting the local CA in the System keychain + editing /etc/hosts) under a
// single macOS admin prompt. Because there is no `vip dev-env` command wired to
// these packages yet (Plans 4/5), this harness is the only way to exercise the
// real code paths end-to-end before that wiring lands.
//
// It is gated behind the `devenv_e2e` build tag so it never runs in CI or a
// normal `go test ./...`. Run it explicitly on a macOS machine with Docker:
//
//	go test -tags devenv_e2e -run TestProxyHostopsE2E -v \
//	    -timeout 5m ./internal/devenv/hostops/
//
// You will be asked for your admin password ONCE (setup: trust CA + add the
// /etc/hosts entry) and ONCE more at teardown (untrust + remove the entry).
//
// What it proves:
//   - proxy.EnsureNetwork / Ensure (real Docker bind + fallback ports)
//   - proxy.EnsureCA / EnsureCert (embedded gen-certs.sh in a one-shot)
//   - proxy.ExtractCA (docker cp the CA PEM to the host)
//   - hostops.Apply: ONE elevation does both trust + /etc/hosts (production path)
//   - a plain `curl https://example.vipdev.lndo.site[:port]/` succeeds with
//     ssl_verify_result=0 — i.e. SYSTEM trust + /etc/hosts both work, no
//     --cacert/--resolve crutches.
//
// Everything it creates is named with the production proxy names and removed in
// teardown (the proxy container, the throwaway nginx backend, the shared
// network, and the certs/proxy_config volumes).
package hostops

import (
	"context"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/devenv/e2esafety"
	"github.com/Automattic/vip/internal/devenv/proxy"
)

const (
	e2eDomain   = compose.DefaultDomain  // vipdev.lndo.site
	e2eHost     = "example." + e2eDomain // example.vipdev.lndo.site
	e2eWeb      = "vip-dev-env-e2e-web"  // throwaway backend container
	e2eCertCN   = e2eHost
	e2eBasename = "example"

	resourceBackendContainer = "backend-container"
	resourceProxyContainer   = "proxy-container"
	resourceProxyNetwork     = "proxy-network"
	resourceCertsVolume      = "certs-volume"
	resourceConfigVolume     = "config-volume"
	resourceTrustedCA        = "trusted-ca"
	resourceManagedHosts     = "managed-hosts"
	resourceCAHostFile       = "ca-host-file"
	resourcePortsState       = "ports-state-file"
)

func TestProxyHostopsE2E(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skipf("e2e trust path is macOS-only; GOOS=%s", runtime.GOOS)
	}
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker not found in PATH")
	}

	ctx := context.Background()
	r := &dockercli.Runner{} // tees child output to os.Stdout/os.Stderr (Log nil)

	before := captureE2ESnapshot(t, ctx, r)
	if err := before.RequireClean(); err != nil {
		t.Fatal(err)
	}
	owned := e2esafety.Snapshot{}
	t.Cleanup(func() { teardownOwned(t, ctx, r, owned) })

	// 1. Shared network + proxy container (real Docker bind + fallback ports).
	if err := proxy.EnsureNetwork(ctx, r); err != nil {
		t.Fatalf("EnsureNetwork: %v", err)
	}
	recordOwned(t, owned, captureE2ESnapshot(t, ctx, r), resourceProxyNetwork)
	ports, err := proxy.Ensure(ctx, r, proxy.EnsureOptions{Domain: e2eDomain})
	if err != nil {
		t.Fatalf("proxy.Ensure: %v", err)
	}
	recordOwned(t, owned, captureE2ESnapshot(t, ctx, r),
		resourceProxyContainer, resourceCertsVolume,
		resourceConfigVolume, resourcePortsState)
	t.Logf("proxy bound: http=%d https=%d (note: ListenProbe cannot bind <1024 as "+
		"non-root, so 80/443 are pre-skipped to fallbacks unless run as root)", ports.HTTP, ports.HTTPS)
	if ports.HTTPS == 0 {
		t.Fatalf("no https port chosen: %+v", ports)
	}

	// 2. CA + per-env leaf cert (SANs incl. the wildcard, mirroring CertSANs).
	if err := proxy.EnsureCA(ctx, r); err != nil {
		t.Fatalf("EnsureCA: %v", err)
	}
	if err := proxy.EnsureCert(ctx, r, proxy.CertRequest{
		Basename:   e2eBasename,
		CommonName: e2eCertCN,
		SANs:       []string{e2eHost, "*." + e2eDomain, "localhost"},
	}); err != nil {
		t.Fatalf("EnsureCert: %v", err)
	}

	// 3. Extract the CA PEM to the host (what hostops.Apply will trust).
	caPath, err := proxy.ExtractCA(ctx, r, proxy.CAHostPath())
	if err != nil {
		t.Fatalf("ExtractCA: %v", err)
	}
	recordOwned(t, owned, captureE2ESnapshot(t, ctx, r), resourceCAHostFile)
	t.Logf("extracted CA -> %s", caPath)

	// 4. Throwaway nginx backend with the Plan-2 secured-router labels.
	if err := r.Docker(ctx, append([]string{
		"run", "-d", "--name", e2eWeb, "--network", compose.ProxyNetwork,
	}, webLabels()...)...); err != nil {
		t.Fatalf("start backend: %v", err)
	}
	recordOwned(t, owned, captureE2ESnapshot(t, ctx, r), resourceBackendContainer)

	// 5. THE PRODUCTION ONE-ELEVATION PATH: trust CA + add /etc/hosts in one prompt.
	t.Log(">>> macOS will now prompt for your admin password ONCE (trust CA + /etc/hosts) <<<")
	if err := Apply(PrivilegedPlan{
		GOOS:     runtime.GOOS,
		CAPath:   caPath,
		HostsAdd: []string{e2eHost},
	}); err != nil {
		t.Fatalf("hostops.Apply (one-elevation trust+hosts): %v", err)
	}
	recordOwned(t, owned, captureE2ESnapshot(t, ctx, r), resourceTrustedCA, resourceManagedHosts)

	// 6. Verify the privileged state landed.
	assertKeychainHasCA(t)
	assertEtcHostsHas(t, e2eHost)

	// 7. Plain HTTPS through the system trust store + /etc/hosts (no crutches).
	url := "https://" + e2eHost
	if ports.HTTPS != 443 {
		url += ":" + strconv.Itoa(ports.HTTPS)
	}
	assertHTTPSTrusted(t, url)
}

// webLabels returns the secured (https/tls) Traefik router labels for the
// throwaway nginx backend (port 80), matching compose/labels.go's scheme for
// id "nginx-example".
func webLabels() []string {
	const id = "nginx-example"
	rule := "HostRegexp(`" + e2eHost + "`)"
	kv := map[string]string{
		"traefik.enable": "true",
		"traefik.http.routers." + id + "-secured.entrypoints":                       "https",
		"traefik.http.routers." + id + "-secured.rule":                              rule,
		"traefik.http.routers." + id + "-secured.tls":                               "true",
		"traefik.http.routers." + id + "-secured.service":                           id + "-secured-service",
		"traefik.http.services." + id + "-secured-service.loadbalancer.server.port": "80",
	}
	var out []string
	for k, v := range kv {
		out = append(out, "--label", k+"="+v)
	}
	out = append(out, "nginx:alpine")
	return out
}

// assertHTTPSTrusted polls curl (system trust, no --cacert/--resolve) until the
// TLS handshake verifies the cert against the trusted CA. The key signal is
// ssl_verify_result=0; the HTTP status only needs to be non-000 (a route
// reached a backend), since traefik may take a moment to register the router.
func assertHTTPSTrusted(t *testing.T, url string) {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	var last string
	for time.Now().Before(deadline) {
		out, _ := exec.Command("curl", "--noproxy", "*", "-sS", "-o", "/dev/null",
			"-w", "%{http_code} %{ssl_verify_result}", url).CombinedOutput()
		last = strings.TrimSpace(string(out))
		fields := strings.Fields(last)
		if len(fields) == 2 && fields[1] == "0" && fields[0] != "000" {
			t.Logf("HTTPS OK (system-trusted): %s -> http=%s ssl_verify=0", url, fields[0])
			return
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatalf("HTTPS via system trust did not verify within timeout: %s (last: %q)", url, last)
}

func assertKeychainHasCA(t *testing.T) {
	t.Helper()
	out, err := exec.Command("security", "find-certificate", "-c", "WPVIP Local CA",
		"/Library/Keychains/System.keychain").CombinedOutput()
	if err != nil {
		t.Fatalf("CA not found in System keychain after Apply: %v\n%s", err, out)
	}
	t.Log("CA present in System keychain ✓")
}

func assertEtcHostsHas(t *testing.T, host string) {
	t.Helper()
	out, err := exec.Command("grep", "-F", host, etcHosts).CombinedOutput()
	if err != nil || !strings.Contains(string(out), host) {
		t.Fatalf("/etc/hosts missing %q after Apply: %v\n%s", host, err, out)
	}
	t.Logf("/etc/hosts has %s -> 127.0.0.1 ✓", host)
}

func captureE2ESnapshot(t *testing.T, ctx context.Context, r *dockercli.Runner) e2esafety.Snapshot {
	t.Helper()
	return e2esafety.Snapshot{
		resourceBackendContainer: dockerObjectIdentity(t, ctx, r, "container", e2eWeb, "{{.Id}}"),
		resourceProxyContainer:   dockerObjectIdentity(t, ctx, r, "container", proxy.ProxyContainerName, "{{.Id}}"),
		resourceProxyNetwork:     dockerObjectIdentity(t, ctx, r, "network", compose.ProxyNetwork, "{{.Id}}"),
		resourceCertsVolume:      dockerObjectIdentity(t, ctx, r, "volume", proxy.ProxyCertsVolume, "{{.Name}}|{{.CreatedAt}}"),
		resourceConfigVolume:     dockerObjectIdentity(t, ctx, r, "volume", proxy.ProxyConfigVolume, "{{.Name}}|{{.CreatedAt}}"),
		resourceTrustedCA:        trustedCAIdentity(t),
		resourceManagedHosts:     managedHostsIdentity(t, etcHosts),
		resourceCAHostFile:       fileIdentity(t, proxy.CAHostPath()),
		resourcePortsState:       fileIdentity(t, proxy.PortsStatePath()),
	}
}

func dockerObjectIdentity(t *testing.T, ctx context.Context, r *dockercli.Runner, kind, name, format string) string {
	t.Helper()
	out, err := r.DockerOut(ctx, kind, "inspect", "--format", format, name)
	if err == nil {
		identity := strings.TrimSpace(string(out))
		if identity == "" {
			t.Fatalf("docker %s inspect returned an empty identity for %q", kind, name)
		}
		return identity
	}

	listFormat := "{{.Name}}"
	var listed []byte
	var listErr error
	if kind == "container" {
		listFormat = "{{.Names}}"
		listed, listErr = r.DockerOut(ctx, kind, "ls", "--all", "--filter", "name="+name, "--format", listFormat)
	} else {
		listed, listErr = r.DockerOut(ctx, kind, "ls", "--filter", "name="+name, "--format", listFormat)
	}
	if listErr != nil {
		t.Fatalf("docker %s lookup for %q failed after inspect error: %v", kind, name, listErr)
	}
	for _, candidate := range strings.Split(strings.TrimSpace(string(listed)), "\n") {
		if candidate == name {
			t.Fatalf("docker %s %q exists but its identity could not be inspected: %v", kind, name, err)
		}
	}
	return ""
}

func trustedCAIdentity(t *testing.T) string {
	t.Helper()
	out, err := exec.Command("security", "find-certificate", "-a", "-c", "WPVIP Local CA", "-p",
		"/Library/Keychains/System.keychain").CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "could not be found") {
			return ""
		}
		t.Fatalf("read trusted WPVIP Local CA: %v: %s", err, strings.TrimSpace(string(out)))
	}
	block, rest := pem.Decode(out)
	if block == nil {
		t.Fatal("trusted WPVIP Local CA is not valid PEM")
	}
	if len(strings.TrimSpace(string(rest))) != 0 {
		t.Fatal("multiple WPVIP Local CA certificates found; refusing ambiguous ownership")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("parse trusted WPVIP Local CA: %v", err)
	}
	return hashIdentity(cert.Raw)
}

func managedHostsIdentity(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read hosts file %s: %v", path, err)
	}
	content := string(b)
	if strings.Count(content, beginMarker) != strings.Count(content, endMarker) {
		t.Fatalf("malformed managed hosts block in %s", path)
	}
	if strings.Count(content, beginMarker) > 1 {
		t.Fatalf("multiple managed hosts blocks found in %s; refusing ambiguous ownership", path)
	}
	start := strings.Index(content, beginMarker)
	end := strings.Index(content, endMarker)
	if start < 0 && end < 0 {
		return ""
	}
	if start < 0 || end < start {
		t.Fatalf("malformed managed hosts block in %s", path)
	}
	end += len(endMarker)
	if end < len(content) && content[end] == '\n' {
		end++
	}
	return hashIdentity([]byte(content[start:end]))
}

func fileIdentity(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return ""
	}
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return hashIdentity(b)
}

func hashIdentity(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func recordOwned(t *testing.T, owned, current e2esafety.Snapshot, names ...string) {
	t.Helper()
	for _, name := range names {
		if current[name] == "" {
			t.Fatalf("created resource %s has no identity", name)
		}
		owned[name] = current[name]
	}
}

func teardownOwned(t *testing.T, ctx context.Context, r *dockercli.Runner, owned e2esafety.Snapshot) {
	t.Helper()
	current := captureE2ESnapshot(t, ctx, r)

	removeDocker := func(key string, args ...string) {
		if !e2esafety.CanRemove(owned[key], current[key]) {
			if owned[key] != "" {
				t.Logf("%s identity changed; refusing removal (manual cleanup may be required)", key)
			}
			return
		}
		if err := r.Docker(ctx, args...); err != nil {
			t.Logf("remove owned %s: %v", key, err)
		}
	}
	removeDocker(resourceBackendContainer, "rm", "-f", e2eWeb)
	removeDocker(resourceProxyContainer, "rm", "-f", proxy.ProxyContainerName)
	removeDocker(resourceConfigVolume, "volume", "rm", proxy.ProxyConfigVolume)
	removeDocker(resourceCertsVolume, "volume", "rm", proxy.ProxyCertsVolume)
	removeDocker(resourceProxyNetwork, "network", "rm", compose.ProxyNetwork)

	var scriptLines []string
	if e2esafety.CanRemove(owned[resourceTrustedCA], current[resourceTrustedCA]) &&
		e2esafety.CanRemove(owned[resourceCAHostFile], current[resourceCAHostFile]) {
		if argv, err := untrustCommand(runtime.GOOS, proxy.CAHostPath()); err == nil {
			scriptLines = append(scriptLines, shellJoin(argv))
		} else {
			t.Logf("owned trusted CA cannot be removed automatically: %v", err)
		}
	} else if owned[resourceTrustedCA] != "" {
		t.Log("trusted CA or extracted CA identity changed; refusing untrust (manual cleanup may be required)")
	}
	if e2esafety.CanRemove(owned[resourceManagedHosts], current[resourceManagedHosts]) {
		scriptLines = append(scriptLines, stripBlockScript())
	} else if owned[resourceManagedHosts] != "" {
		t.Log("managed hosts identity changed; refusing removal (manual cleanup may be required)")
	}
	if len(scriptLines) > 0 {
		t.Log(">>> sudo will prompt once to remove only identity-matched privileged state <<<")
		if err := runElevatedScript("#!/bin/sh\nset -e\n" + strings.Join(scriptLines, "\n") + "\n"); err != nil {
			t.Logf("owned privileged teardown failed: %v", err)
		}
	}

	removeOwnedFile := func(key, path string) {
		if !e2esafety.CanRemove(owned[key], current[key]) {
			if owned[key] != "" {
				t.Logf("%s identity changed; refusing file removal (manual cleanup may be required)", key)
			}
			return
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			t.Logf("remove owned %s: %v", key, err)
		}
	}
	removeOwnedFile(resourceCAHostFile, proxy.CAHostPath())
	removeOwnedFile(resourcePortsState, proxy.PortsStatePath())
}

// runElevatedScript runs a /bin/sh script once under a single sudo prompt.
// Test-only mirror of Apply's exec, used for teardown (which must untrust —
// something Apply/PrivilegedPlan does not model).
func runElevatedScript(script string) error {
	f, err := os.CreateTemp("", "vip-dev-env-e2e-teardown-*.sh")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err := f.WriteString(script); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	cmd := exec.Command("sudo", "/bin/sh", name)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

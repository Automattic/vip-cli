package devenv

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	xproxy "golang.org/x/net/http/httpproxy"

	"github.com/Automattic/vip/internal/httpproxy"
)

// proxyPolicyEnv is every variable internal/httpproxy consults. Cleared so an
// ambient shell (or `make test-parity-unit-hostile`, which exports all of them)
// cannot decide the outcome.
var proxyPolicyEnv = []string{
	"VIP_PROXY", "vip_proxy",
	"SOCKS_PROXY", "socks_proxy",
	"HTTPS_PROXY", "https_proxy",
	"HTTP_PROXY", "http_proxy",
	"ALL_PROXY", "all_proxy",
	"NO_PROXY", "no_proxy",
	"VIP_USE_SYSTEM_PROXY",
	"npm_config_proxy", "npm_config_https_proxy", "npm_config_http_proxy", "npm_config_no_proxy",
}

func clearProxyPolicyEnv(t *testing.T) {
	t.Helper()
	for _, k := range proxyPolicyEnv {
		t.Setenv(k, "")
	}
}

func deadLoopbackAddr(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := l.Addr().String()
	if err := l.Close(); err != nil {
		t.Fatalf("close listener: %v", err)
	}
	return addr
}

// assertStdlibWouldNotProxy is the guard against a vacuous pass. Neither
// net/http's resolver nor x/net's will ever proxy a loopback host, so a test
// that only asserted "the request failed" could be passing for a reason that
// has nothing to do with the fix. Pinning that the stdlib resolver declines
// this target makes the contrast explicit: the OLD code reached the server.
func assertStdlibWouldNotProxy(t *testing.T, rawURL string) {
	t.Helper()
	u, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse %q: %v", rawURL, err)
	}
	got, err := xproxy.FromEnvironment().ProxyFunc()(u)
	if err != nil {
		t.Fatalf("stdlib ProxyFunc: %v", err)
	}
	if got != nil {
		t.Fatalf("precondition failed: the stdlib resolver picked %s for %s, so this test could "+
			"pass without the fix", got, rawURL)
	}
}

// TestRegistryReachableHonoursVIPProxy pins the ghcr.io reachability probe to
// vip-next's proxy policy.
//
// The probe gates image pulls (lifecycle.ShouldPull). On http.DefaultTransport
// it ignored VIP_PROXY and SOCKS_PROXY entirely, so a developer behind the VIP
// SOCKS proxy — whose only route off the machine IS that proxy — got a direct
// HEAD that could only succeed by accident, or an ambient HTTPS_PROXY honoured
// without the VIP_USE_SYSTEM_PROXY opt-in.
func TestRegistryReachableHonoursVIPProxy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	clearProxyPolicyEnv(t)
	t.Setenv("VIP_PROXY", "socks5://"+deadLoopbackAddr(t))
	assertStdlibWouldNotProxy(t, srv.URL)

	restore := registryProbeURL
	registryProbeURL = srv.URL
	defer func() { registryProbeURL = restore }()

	if registryReachable() {
		t.Fatal("registryReachable() = true; VIP_PROXY was ignored and the probe went direct")
	}
}

// TestRegistryReachableSucceedsWithoutAProxy is the other half: the fix must
// not make every developer look offline.
func TestRegistryReachableSucceedsWithoutAProxy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	clearProxyPolicyEnv(t)

	restore := registryProbeURL
	registryProbeURL = srv.URL
	defer func() { registryProbeURL = restore }()

	if !registryReachable() {
		t.Fatal("registryReachable() = false with no proxy configured")
	}
}

// TestHealthProbeIsNeverProxied is the deliberate exception, and the reason
// this slice did not simply route every dev-environment request through the
// policy.
//
// httpProber fetches https://<slug>.vipdev.site/ — a name /etc/hosts maps to
// 127.0.0.1 on the developer's own machine. ProxyURL applies VIP_PROXY
// unconditionally with no loopback exemption (deliberately, to match Node's
// proxy-from-env), so wiring this probe to httpproxy.Client would break every
// developer with the VIP SOCKS proxy exported: the proxy would resolve and dial
// the env's hostname on ITS side, where the containers do not exist. Node does
// not proxy it either — the only dev-environment request Node hands to
// createProxyAgent is the WordPress version manifest.
//
// Both clients run against the same server under the same environment, so the
// assertion cannot pass vacuously: if the policy client ever stops failing
// here, the prober's success proves nothing and this test says so.
func TestHealthProbeIsNeverProxied(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	clearProxyPolicyEnv(t)
	t.Setenv("VIP_PROXY", "socks5://"+deadLoopbackAddr(t))

	if resp, err := httpproxy.ClientWithTimeout(5 * time.Second).Get(srv.URL); err == nil {
		_ = resp.Body.Close()
		t.Fatal("precondition failed: the policy client reached a loopback target, so this test " +
			"can no longer tell a direct probe apart from a proxied one")
	}

	code, err := httpProber{}.Probe(srv.URL)
	if err != nil {
		t.Fatalf("health probe was routed through VIP_PROXY: %v", err)
	}
	if code != http.StatusOK {
		t.Fatalf("health probe status = %d, want 200", code)
	}
}

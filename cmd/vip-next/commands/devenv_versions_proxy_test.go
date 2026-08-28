package commands

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	xproxy "golang.org/x/net/http/httpproxy"
)

// proxyEnvVars is every variable internal/httpproxy consults, cleared so an
// ambient shell (or `make test-parity-unit-hostile`) cannot decide the result.
var proxyEnvVars = []string{
	"VIP_PROXY", "vip_proxy",
	"SOCKS_PROXY", "socks_proxy",
	"HTTPS_PROXY", "https_proxy",
	"HTTP_PROXY", "http_proxy",
	"ALL_PROXY", "all_proxy",
	"NO_PROXY", "no_proxy",
	"VIP_USE_SYSTEM_PROXY",
	"npm_config_proxy", "npm_config_https_proxy", "npm_config_http_proxy", "npm_config_no_proxy",
}

func clearProxyEnvVars(t *testing.T) {
	t.Helper()
	for _, k := range proxyEnvVars {
		t.Setenv(k, "")
	}
}

func closedLoopback(t *testing.T) string {
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

// assertNoStdlibProxy is the guard against a vacuous pass. Neither net/http's
// resolver nor x/net's will ever proxy a loopback host, so a test that only
// asserted "the request failed" could be passing for a reason unrelated to the
// fix. Pinning that the stdlib resolver declines this target makes the contrast
// explicit: the OLD code, on http.DefaultTransport, reached the server.
func assertNoStdlibProxy(t *testing.T, rawURL string) {
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

// TestWordPressVersionChoicesHonoursVIPProxy is the direct parity assertion for
// the one dev-environment request Node routes through createProxyAgent.
//
// Node: fetchVersionList (src/lib/dev-environment/dev-environment-core.ts:1044)
// builds the raw.githubusercontent.com URL, calls createProxyAgent(url), and
// passes the agent to fetch. Go fetched the same manifest on
// http.DefaultTransport, which ignores VIP_PROXY/SOCKS_PROXY outright and
// honours HTTPS_PROXY without the VIP_USE_SYSTEM_PROXY opt-in — the exact
// inversion internal/httpproxy exists to correct.
//
// The contrast is what makes this test mean something. The target is a loopback
// httptest server, and NEITHER net/http's resolver nor x/net's will ever proxy
// a loopback host — so a test that merely asserted "the fetch failed" would
// have passed for the wrong reason, or passed vacuously before the fix. The
// stdlib assertion below pins that: with only VIP_PROXY set, the stdlib
// resolver selects NO proxy and the old code reached the server and returned
// every tag. Node's proxy-from-env has no loopback exemption, so ours must
// attempt the dead SOCKS port and degrade to trunk.
func TestWordPressVersionChoicesHonoursVIPProxy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"tag":"6.5"},{"tag":"6.4"}]`))
	}))
	defer srv.Close()

	clearProxyEnvVars(t)
	t.Setenv("VIP_PROXY", "socks5://"+closedLoopback(t))

	assertNoStdlibProxy(t, srv.URL)

	restore := wordpressVersionsURL
	wordpressVersionsURL = srv.URL
	defer func() { wordpressVersionsURL = restore }()

	got := wordpressVersionChoices()
	if len(got) != 1 || got[0] != "trunk" {
		t.Fatalf("wordpressVersionChoices() = %v; VIP_PROXY was ignored and the manifest was "+
			"fetched directly, which Node would not have done", got)
	}
}

// TestWordPressVersionChoicesReachesTheManifestWithoutAProxy is the other half:
// the fix must not turn every version list into a bare "trunk".
func TestWordPressVersionChoicesReachesTheManifestWithoutAProxy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"tag":"6.5"},{"tag":"6.4"}]`))
	}))
	defer srv.Close()

	clearProxyEnvVars(t)

	restore := wordpressVersionsURL
	wordpressVersionsURL = srv.URL
	defer func() { wordpressVersionsURL = restore }()

	got := wordpressVersionChoices()
	want := []string{"trunk", "6.5", "6.4"}
	if len(got) != len(want) {
		t.Fatalf("wordpressVersionChoices() = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("wordpressVersionChoices()[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

package httpproxy

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	xproxy "golang.org/x/net/http/httpproxy"
)

// proxyEnv is every variable the selection logic reads. Tests clear all of
// them and set back only what they mean to exercise, because the ambient shell
// (or `make test-parity-unit-hostile`) may export any of them.
var proxyEnv = []string{
	"VIP_PROXY", "vip_proxy",
	"SOCKS_PROXY", "socks_proxy",
	"HTTPS_PROXY", "https_proxy",
	"HTTP_PROXY", "http_proxy",
	"ALL_PROXY", "all_proxy",
	"NO_PROXY", "no_proxy",
	"VIP_USE_SYSTEM_PROXY",
	"npm_config_proxy", "npm_config_https_proxy", "npm_config_http_proxy", "npm_config_no_proxy",
}

func clearProxyEnv(t *testing.T) {
	t.Helper()
	for _, k := range proxyEnv {
		// An empty value reads the same as unset everywhere the selection
		// logic looks (Node tests truthiness; we test != ""), and t.Setenv
		// restores the original for us.
		t.Setenv(k, "")
	}
}

func mustParse(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse %q: %v", raw, err)
	}
	return u
}

func proxyFor(t *testing.T, target string) *url.URL {
	t.Helper()
	req := &http.Request{URL: mustParse(t, target)}
	got, err := ProxyURL(req)
	if err != nil {
		t.Fatalf("ProxyURL(%s): %v", target, err)
	}
	return got
}

// TestSystemProxyIsOptInOnly is the priority half of cutover item 2.14.
//
// Node reaches the API through node-fetch with an explicit agent from
// createProxyAgent (src/lib/api/http.ts:42). node-fetch reads no proxy
// environment of its own, so HTTPS_PROXY alone is DELIBERATELY ignored: the
// module comment (proxy-agent.ts:9-11) says VIP_USE_SYSTEM_PROXY is what opts a
// user in. Go's http.DefaultTransport reads HTTPS_PROXY unconditionally, so a
// user who declined system-proxy use had their bearer token routed through a
// corporate proxy Node bypassed.
//
// The assertion is a direct contrast with the resolver net/http uses by
// default, so it cannot pass by accident: that resolver must select the proxy
// here and ours must not. (x/net's copy is the same code net/http vendors,
// used directly because http.ProxyFromEnvironment caches the environment in a
// sync.Once and would not see t.Setenv.)
func TestSystemProxyIsOptInOnly(t *testing.T) {
	clearProxyEnv(t)
	t.Setenv("HTTPS_PROXY", "http://corp-proxy.example:3128")
	t.Setenv("HTTP_PROXY", "http://corp-proxy.example:3128")

	req := &http.Request{URL: mustParse(t, "https://api.wpvip.com/graphql")}

	stdlib, err := xproxy.FromEnvironment().ProxyFunc()(req.URL)
	if err != nil {
		t.Fatalf("stdlib ProxyFunc: %v", err)
	}
	if stdlib == nil {
		t.Fatal("precondition failed: the stdlib resolver should have picked HTTPS_PROXY")
	}

	got, err := ProxyURL(req)
	if err != nil {
		t.Fatalf("ProxyURL: %v", err)
	}
	if got != nil {
		t.Errorf("HTTPS_PROXY was honoured without VIP_USE_SYSTEM_PROXY: %s", got)
	}
}

// TestSystemProxyHonouredWhenOptedIn is the other side: once the user opts in,
// HTTPS_PROXY applies regardless of the target's scheme (createProxyAgent reads
// HTTPS_PROXY for every URL, not just https ones).
func TestSystemProxyHonouredWhenOptedIn(t *testing.T) {
	clearProxyEnv(t)
	t.Setenv("VIP_USE_SYSTEM_PROXY", "1")
	t.Setenv("HTTPS_PROXY", "http://corp-proxy.example:3128")

	for _, target := range []string{"https://api.wpvip.com/graphql", "http://api.wpvip.com/upload"} {
		got := proxyFor(t, target)
		if got == nil || got.Host != "corp-proxy.example:3128" {
			t.Errorf("ProxyURL(%s) = %v, want corp-proxy.example:3128", target, got)
		}
	}
}

// TestVIPProxyWinsAndNeedsNoOptIn pins precedence rule 1 in proxy-agent.ts:
// VIP_PROXY is checked before the VIP_USE_SYSTEM_PROXY gate and before
// NO_PROXY, "fully backward compatible" with the pre-system-proxy module.
func TestVIPProxyWinsAndNeedsNoOptIn(t *testing.T) {
	clearProxyEnv(t)
	t.Setenv("VIP_PROXY", "socks5://127.0.0.1:1080")
	t.Setenv("SOCKS_PROXY", "socks5://ignored.example:1080")
	t.Setenv("HTTPS_PROXY", "http://ignored.example:3128")
	t.Setenv("NO_PROXY", "*")

	got := proxyFor(t, "https://api.wpvip.com/graphql")
	if got == nil {
		t.Fatal("VIP_PROXY must apply with no opt-in and regardless of NO_PROXY")
	}
	if got.Scheme != "socks5" || got.Host != "127.0.0.1:1080" {
		t.Errorf("ProxyURL = %s, want socks5://127.0.0.1:1080", got)
	}
}

// TestSocksProxyPreferredOverHTTPSWhenOptedIn pins rules 3 and 4: with the
// opt-in set, SOCKS_PROXY beats HTTPS_PROXY.
func TestSocksProxyPreferredOverHTTPSWhenOptedIn(t *testing.T) {
	clearProxyEnv(t)
	t.Setenv("VIP_USE_SYSTEM_PROXY", "1")
	t.Setenv("SOCKS_PROXY", "socks5://socks.example:1080")
	t.Setenv("HTTPS_PROXY", "http://corp-proxy.example:3128")

	got := proxyFor(t, "https://api.wpvip.com/graphql")
	if got == nil || got.Scheme != "socks5" || got.Host != "socks.example:1080" {
		t.Errorf("ProxyURL = %v, want socks5://socks.example:1080", got)
	}
}

// TestNoProxyAppliesOnlyToTheSystemProxyBranch pins rule 5, including the
// quirk it inherits from proxy-from-env: coveredInNoProxy asks getProxyForUrl,
// which returns an empty string both when NO_PROXY matches AND when no
// http(s)_proxy applies
// to the URL at all. So a NO_PROXY that does not match still suppresses a
// SOCKS_PROXY-only configuration.
func TestNoProxyAppliesOnlyToTheSystemProxyBranch(t *testing.T) {
	t.Run("matching NO_PROXY suppresses the system proxy", func(t *testing.T) {
		clearProxyEnv(t)
		t.Setenv("VIP_USE_SYSTEM_PROXY", "1")
		t.Setenv("HTTPS_PROXY", "http://corp-proxy.example:3128")
		t.Setenv("NO_PROXY", "api.wpvip.com")

		if got := proxyFor(t, "https://api.wpvip.com/graphql"); got != nil {
			t.Errorf("ProxyURL = %s, want nil (host is in NO_PROXY)", got)
		}
	})

	t.Run("non-matching NO_PROXY leaves the system proxy in place", func(t *testing.T) {
		clearProxyEnv(t)
		t.Setenv("VIP_USE_SYSTEM_PROXY", "1")
		t.Setenv("HTTPS_PROXY", "http://corp-proxy.example:3128")
		t.Setenv("NO_PROXY", "internal.example")

		if got := proxyFor(t, "https://api.wpvip.com/graphql"); got == nil {
			t.Error("ProxyURL = nil, want the system proxy (host is not in NO_PROXY)")
		}
	})

	t.Run("NO_PROXY does not touch VIP_PROXY", func(t *testing.T) {
		clearProxyEnv(t)
		t.Setenv("VIP_PROXY", "socks5://127.0.0.1:1080")
		t.Setenv("NO_PROXY", "api.wpvip.com")

		if got := proxyFor(t, "https://api.wpvip.com/graphql"); got == nil {
			t.Error("ProxyURL = nil; VIP_PROXY is checked before the NO_PROXY branch")
		}
	})

	t.Run("wildcard NO_PROXY suppresses subdomains", func(t *testing.T) {
		clearProxyEnv(t)
		t.Setenv("VIP_USE_SYSTEM_PROXY", "1")
		t.Setenv("HTTPS_PROXY", "http://corp-proxy.example:3128")
		t.Setenv("NO_PROXY", ".wpvip.com")

		if got := proxyFor(t, "https://api.wpvip.com/graphql"); got != nil {
			t.Errorf("ProxyURL = %s, want nil (.wpvip.com covers api.wpvip.com)", got)
		}
	})
}

// TestNoProxyIsIgnoredWhenUnset guards the early return in coveredInNoProxy:
// proxy-from-env cannot express "no NO_PROXY set", so proxy-agent.ts short-
// circuits before calling it. Dropping that check would make every request
// unproxied, since getProxyForUrl knows nothing about SOCKS_PROXY.
func TestNoProxyIsIgnoredWhenUnset(t *testing.T) {
	clearProxyEnv(t)
	t.Setenv("VIP_USE_SYSTEM_PROXY", "1")
	t.Setenv("SOCKS_PROXY", "socks5://socks.example:1080")

	if got := proxyFor(t, "https://api.wpvip.com/graphql"); got == nil {
		t.Error("ProxyURL = nil, want the SOCKS proxy (NO_PROXY is unset)")
	}
}

// TestNoProxySet returns to the quirk above with a concrete assertion, so a
// future "cleanup" that makes SOCKS_PROXY survive an unrelated NO_PROXY is
// caught as the divergence it would be.
func TestNoProxySetSuppressesSocksOnlyConfig(t *testing.T) {
	clearProxyEnv(t)
	t.Setenv("VIP_USE_SYSTEM_PROXY", "1")
	t.Setenv("SOCKS_PROXY", "socks5://socks.example:1080")
	t.Setenv("NO_PROXY", "unrelated.example")

	if got := proxyFor(t, "https://api.wpvip.com/graphql"); got != nil {
		t.Errorf("ProxyURL = %s; getProxyForUrl knows no SOCKS var, so it returns '' "+
			"and coveredInNoProxy reports true — Node's behaviour", got)
	}
}

func TestNoProxyEnvIsAllUnsetByDefault(t *testing.T) {
	clearProxyEnv(t)
	if got := proxyFor(t, "https://api.wpvip.com/graphql"); got != nil {
		t.Errorf("ProxyURL = %s, want nil with no proxy variables set", got)
	}
}

func TestUnsupportedSocksSchemeFailsLoudly(t *testing.T) {
	clearProxyEnv(t)
	t.Setenv("VIP_PROXY", "socks4://legacy.example:1080")

	req := &http.Request{URL: mustParse(t, "https://api.wpvip.com/graphql")}
	if _, err := ProxyURL(req); err == nil {
		t.Error("socks4 is unsupported by net/http; it must fail, not connect direct")
	}
}

// TestProxyErrorsDoNotLeakCredentials guards a path this slice creates. Proxy
// URLs routinely carry userinfo (socks5://user:pass@host), and these errors do
// not stay local: cmd/vip-next/main.go registers an exit hook that ships the
// error text to the telemetry endpoint. Whatever we put in the message leaves
// the machine.
func TestProxyErrorsDoNotLeakCredentials(t *testing.T) {
	const secret = "hunter2-proxy-password"
	cases := map[string]string{
		"VIP_PROXY":   "socks4://alice:" + secret + "@legacy.example:1080",
		"SOCKS_PROXY": "gopher://alice:" + secret + "@weird.example:1080",
	}
	for envVar, value := range cases {
		t.Run(envVar, func(t *testing.T) {
			clearProxyEnv(t)
			t.Setenv("VIP_USE_SYSTEM_PROXY", "1")
			t.Setenv(envVar, value)

			req := &http.Request{URL: mustParse(t, "https://api.wpvip.com/graphql")}
			_, err := ProxyURL(req)
			if err == nil {
				t.Fatal("expected an error for an unsupported proxy scheme")
			}
			if strings.Contains(err.Error(), secret) {
				t.Errorf("proxy password appears in the error text: %v", err)
			}
			if !strings.Contains(err.Error(), "legacy.example") &&
				!strings.Contains(err.Error(), "weird.example") {
				t.Errorf("error must still name the host so the user can fix it: %v", err)
			}
		})
	}
}

// TestClientHonoursVIPProxy is the end-to-end half, and reproduces the
// empirical finding in the parity review verbatim: with
// VIP_PROXY=socks5://127.0.0.1:<closed>, Node exits 1 (Socket closed) while
// vip-next exited 0, having ignored the variable completely.
//
// The target is a live loopback server on purpose. Neither
// http.ProxyFromEnvironment nor golang.org/x/net/http/httpproxy will ever proxy
// a loopback host, so a client that still reaches the server is proof the
// request went direct. Node has no such exemption (proxy-from-env's shouldProxy
// only consults NO_PROXY), so the request must be attempted through the dead
// SOCKS port and fail.
func TestClientHonoursVIPProxy(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	clearProxyEnv(t)
	t.Setenv("VIP_PROXY", "socks5://"+closedLoopbackAddr(t))

	resp, err := Client().Get(target.URL)
	if err == nil {
		_ = resp.Body.Close()
		t.Fatal("request succeeded; VIP_PROXY was ignored and the connection went direct")
	}
}

// TestDirectClientIsNeverProxied covers the other kind of request vip-next
// makes: one whose target is the user's OWN machine.
//
// The dev-environment health probe fetches https://<slug>.vipdev.site/, a name
// /etc/hosts maps to 127.0.0.1. Routing it through the policy would break every
// developer with VIP_PROXY exported — an A8c laptop's normal state — because a
// SOCKS proxy resolves and dials that name on the PROXY's side, where the
// developer's containers do not exist. Node never proxies it either: the one
// dev-environment request it hands to createProxyAgent is the WordPress version
// manifest (dev-environment-core.ts:1044), and Lando's health check is internal.
//
// So this needs to be a deliberate, greppable "never proxy", not a bare
// &http.Client{} that merely happens to go direct today.
//
// Both clients are exercised against the same server under the same environment
// so the assertion cannot pass vacuously: our own policy has no loopback
// exemption, so ClientWithTimeout MUST fail here. If it ever starts succeeding,
// the direct half proves nothing and this test says so.
func TestDirectClientIsNeverProxied(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	clearProxyEnv(t)
	t.Setenv("VIP_PROXY", "socks5://"+closedLoopbackAddr(t))

	resp, err := ClientWithTimeout(5 * time.Second).Get(target.URL)
	if err == nil {
		_ = resp.Body.Close()
		t.Fatal("precondition failed: the proxied client reached a loopback target, so this " +
			"test can no longer tell a direct client apart from a proxied one")
	}

	resp, err = DirectClientWithTimeout(5 * time.Second).Get(target.URL)
	if err != nil {
		t.Fatalf("DirectClientWithTimeout was routed through VIP_PROXY: %v", err)
	}
	_ = resp.Body.Close()
}

// TestDirectClientIgnoresSystemProxyToo pins the same guarantee against the
// variables the stdlib honours by default, at the transport level — a loopback
// target could never demonstrate this, since neither resolver proxies loopback.
func TestDirectClientIgnoresSystemProxyToo(t *testing.T) {
	clearProxyEnv(t)
	t.Setenv("VIP_USE_SYSTEM_PROXY", "1")
	t.Setenv("HTTPS_PROXY", "http://corp-proxy.example:3128")
	t.Setenv("HTTP_PROXY", "http://corp-proxy.example:3128")

	req := &http.Request{URL: mustParse(t, "https://example.invalid/health")}

	stdlib, err := xproxy.FromEnvironment().ProxyFunc()(req.URL)
	if err != nil {
		t.Fatalf("stdlib ProxyFunc: %v", err)
	}
	if stdlib == nil {
		t.Fatal("precondition failed: the stdlib resolver should have picked HTTPS_PROXY")
	}
	if got, err := ProxyURL(req); err != nil || got == nil {
		t.Fatalf("precondition failed: our own policy should proxy this (got %v, %v)", got, err)
	}

	tr, ok := DirectClientWithTimeout(time.Second).Transport.(*http.Transport)
	if !ok {
		t.Fatalf("DirectClientWithTimeout transport is %T, want *http.Transport", DirectClientWithTimeout(time.Second).Transport)
	}
	if tr.Proxy != nil {
		got, err := tr.Proxy(req)
		t.Fatalf("direct transport has a Proxy func returning (%v, %v); it must be nil", got, err)
	}
}

// TestClientDoesNotProxyWithoutOptIn is the security assertion at the client
// level. The proxy is a live loopback recorder and the target is a name that
// cannot resolve, so a request reaching the recorder can only have got there
// through the proxy.
//
// Both halves are exercised in one test on purpose. A client built with the
// policy net/http applies by default hands the request — Authorization header
// and all — straight to a proxy the user never opted into; ours must not. Only
// asserting our own side would pass vacuously, because a DNS failure and a
// declined proxy look identical from the caller.
func TestClientDoesNotProxyWithoutOptIn(t *testing.T) {
	seen := 0
	recorder := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		seen++
		w.WriteHeader(http.StatusOK)
	}))
	defer recorder.Close()

	clearProxyEnv(t)
	t.Setenv("HTTPS_PROXY", recorder.URL)
	t.Setenv("HTTP_PROXY", recorder.URL)
	t.Setenv("ALL_PROXY", recorder.URL)

	const target = "http://vip-cli-parity.invalid/graphql"

	stdlibPolicy := &http.Client{Transport: &http.Transport{
		Proxy: func(r *http.Request) (*url.URL, error) {
			return xproxy.FromEnvironment().ProxyFunc()(r.URL)
		},
	}}
	if resp, err := stdlibPolicy.Get(target); err == nil {
		_ = resp.Body.Close()
	}
	if seen != 1 {
		t.Fatalf("precondition failed: the stdlib policy should have proxied; recorder saw %d", seen)
	}

	seen = 0
	if resp, err := Client().Get(target); err == nil {
		_ = resp.Body.Close()
	}
	if seen != 0 {
		t.Fatalf("proxy received %d request(s); the token would have gone to a proxy the user never opted into", seen)
	}
}

// closedLoopbackAddr returns a loopback host:port that is guaranteed to refuse
// connections: it binds, reads the assigned port, then closes the listener.
func closedLoopbackAddr(t *testing.T) string {
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

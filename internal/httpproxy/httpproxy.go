// Package httpproxy is the Go port of src/lib/http/proxy-agent.ts, plus the
// parts of the `proxy-from-env` npm package that file depends on.
//
// It exists because the two runtimes disagree about the DEFAULT. Node reaches
// the API through node-fetch with an explicit agent (src/lib/api/http.ts:42),
// and node-fetch reads no proxy environment of its own — so an ambient
// HTTPS_PROXY is ignored unless the user sets VIP_USE_SYSTEM_PROXY. Go's
// http.DefaultTransport reads HTTP_PROXY/HTTPS_PROXY unconditionally, so
// vip-next was routing bearer tokens through proxies the Node CLI deliberately
// bypassed, while ignoring the VIP_PROXY/SOCKS_PROXY variables Node does honour.
//
// Every vip-next HTTP client that talks to the VIP API must use Client() or
// Transport() rather than http.DefaultClient.
package httpproxy

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// ProxyURL is the port of createProxyAgent (proxy-agent.ts:20-46). It is shaped
// as an http.Transport.Proxy func: nil means "connect directly".
//
// Precedence, verbatim from the source's own comment:
//
//  1. VIP_PROXY set: a SOCKS proxy, unconditionally — before the opt-in gate
//     and before NO_PROXY. This is the pre-system-proxy behaviour and stays
//     backward compatible.
//  2. Nothing applicable set: no proxy.
//  3. VIP_USE_SYSTEM_PROXY and SOCKS_PROXY: SOCKS.
//  4. VIP_USE_SYSTEM_PROXY and HTTPS_PROXY: HTTP CONNECT. Note that Node checks
//     HTTPS_PROXY for EVERY target, not only https:// ones, and never consults
//     HTTP_PROXY at all.
//  5. NO_PROXY alongside the opt-in: see coveredInNoProxy.
//
// Errors are returned rather than swallowed. A proxy the user configured but
// that we cannot honour must fail the request; silently connecting direct is
// how the SOCKS half of this bug went unnoticed.
func ProxyURL(req *http.Request) (*url.URL, error) {
	if req == nil || req.URL == nil {
		return nil, nil
	}
	target := req.URL

	// 1. VIP Socks Proxy takes precedence and is fully backward compatible.
	if vipProxy := firstEnv("VIP_PROXY", "vip_proxy"); vipProxy != "" {
		return socksProxyURL(vipProxy)
	}

	// 2-5. System proxy usage, gated on the explicit opt-in.
	if os.Getenv("VIP_USE_SYSTEM_PROXY") == "" {
		return nil, nil
	}
	noProxy := firstEnv("NO_PROXY", "no_proxy")
	if coveredInNoProxy(target, noProxy) {
		return nil, nil
	}
	if socksProxy := firstEnv("SOCKS_PROXY", "socks_proxy"); socksProxy != "" {
		return socksProxyURL(socksProxy)
	}
	if httpsProxy := firstEnv("HTTPS_PROXY", "https_proxy"); httpsProxy != "" {
		return httpsProxyURL(httpsProxy)
	}
	return nil, nil
}

// Transport returns an http.Transport with vip-next's proxy policy and
// otherwise the stdlib defaults (connection pooling, timeouts, HTTP/2).
func Transport() *http.Transport {
	base, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return &http.Transport{Proxy: ProxyURL}
	}
	t := base.Clone()
	t.Proxy = ProxyURL
	return t
}

// Client returns an http.Client with vip-next's proxy policy and no timeout,
// matching http.DefaultClient in every other respect.
func Client() *http.Client { return &http.Client{Transport: Transport()} }

// ClientWithTimeout is Client with a per-request deadline.
func ClientWithTimeout(d time.Duration) *http.Client {
	c := Client()
	c.Timeout = d
	return c
}

// DirectClientWithTimeout returns a client that NEVER consults a proxy, for the
// requests whose target is the user's own machine.
//
// The dev-environment health probe is the case that motivated it: it fetches
// https://<slug>.vipdev.site/, a name /etc/hosts maps to 127.0.0.1. ProxyURL
// applies VIP_PROXY unconditionally and exempts no loopback — deliberately, to
// match proxy-from-env — so routing that probe through the policy would break
// every developer with the VIP SOCKS proxy exported: the proxy would resolve
// and dial <slug>.vipdev.site on its OWN side, where the containers do not
// exist. Node does not proxy it either; Lando's health check is internal, and
// the single dev-environment request Node hands to createProxyAgent is the
// WordPress version manifest (dev-environment-core.ts:1044).
//
// This exists so "goes direct" is a decision a reader can grep for. A bare
// &http.Client{} would go direct today for a different, accidental reason —
// http.DefaultTransport ignores VIP_PROXY entirely — and would silently start
// honouring an ambient HTTPS_PROXY, which is the bug this package removed.
func DirectClientWithTimeout(d time.Duration) *http.Client {
	t := directTransport()
	return &http.Client{Transport: t, Timeout: d}
}

func directTransport() *http.Transport {
	base, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return &http.Transport{}
	}
	t := base.Clone()
	t.Proxy = nil
	return t
}

// socksProxyURL is the SocksProxyAgent constructor's Go equivalent.
//
// Divergence, deliberate and loud: socks-proxy-agent also speaks socks4 and
// socks4a, which net/http cannot. Rather than fall back to a direct connection
// — the exact silent failure this package exists to remove — an unsupported
// scheme is an error. "socks" is socks5 in socks-proxy-agent, and net/http
// treats socks5 and socks5h identically.
func socksProxyURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid SOCKS proxy %s: %w", redact(raw), err)
	}
	switch u.Scheme {
	case "socks", "":
		u.Scheme = "socks5"
	case "socks5", "socks5h":
	case "socks4", "socks4a":
		return nil, fmt.Errorf("SOCKS proxy %s: socks4/socks4a is not supported; use socks5", redact(raw))
	default:
		return nil, fmt.Errorf("SOCKS proxy %s: unsupported scheme %q", redact(raw), u.Scheme)
	}
	if u.Host == "" {
		return nil, fmt.Errorf("SOCKS proxy %s has no host", redact(raw))
	}
	return u, nil
}

// redact strips the userinfo from a proxy URL before it can reach an error
// message. Proxy URLs routinely carry credentials, and these errors do not stay
// on the machine: cmd/vip-next/main.go registers an exit hook that ships the
// error text to the telemetry endpoint. The host is deliberately preserved —
// the user needs to know WHICH proxy setting is wrong.
func redact(raw string) string {
	if u, err := url.Parse(raw); err == nil && u.User != nil {
		return u.Redacted()
	}
	// Unparseable, or no userinfo. Fall back to a textual cut at "@" so a
	// malformed value with an embedded password still cannot escape.
	if at := strings.LastIndex(raw, "@"); at >= 0 {
		if scheme := strings.Index(raw, "://"); scheme >= 0 && scheme+3 <= at {
			return raw[:scheme+3] + "xxxxx@" + raw[at+1:]
		}
		return "xxxxx@" + raw[at+1:]
	}
	return raw
}

// httpsProxyURL is the HttpsProxyAgent constructor's Go equivalent. A value
// with no scheme (`proxy.example:3128`) is read as http://, which is what
// golang.org/x/net/http/httpproxy does; https-proxy-agent's URL parse would
// simply produce a hostless agent, so there is no useful behaviour to copy.
func httpsProxyURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		if u2, err2 := url.Parse("http://" + raw); err2 == nil && u2.Host != "" {
			return u2, nil
		}
	}
	if err != nil {
		return nil, fmt.Errorf("invalid HTTPS proxy %s: %w", redact(raw), err)
	}
	if u.Host == "" {
		return nil, fmt.Errorf("HTTPS proxy %s has no host", redact(raw))
	}
	return u, nil
}

// coveredInNoProxy ports proxy-agent.ts:60-68.
//
// The early return is load-bearing: getProxyForUrl cannot distinguish "NO_PROXY
// matched" from "no proxy variable applies to this URL", so proxy-agent.ts only
// asks it once NO_PROXY is actually set. The conflation survives anyway in one
// configuration, and it is Node's: with NO_PROXY set and SOCKS_PROXY as the only
// proxy variable, getProxyForUrl returns "" — it has never heard of SOCKS_PROXY
// — so the SOCKS proxy is suppressed even for a host NO_PROXY does not name.
func coveredInNoProxy(target *url.URL, noProxy string) bool {
	if noProxy == "" {
		return false
	}
	return getProxyForURL(target) == ""
}

// defaultPorts mirrors proxy-from-env's DEFAULT_PORTS.
var defaultPorts = map[string]int{
	"ftp": 21, "gopher": 70, "http": 80, "https": 443, "ws": 80, "wss": 443,
}

// getProxyForURL ports proxy-from-env's getProxyForUrl.
func getProxyForURL(target *url.URL) string {
	proto := target.Scheme
	hostname := strings.ToLower(target.Hostname())
	if hostname == "" || proto == "" {
		return ""
	}
	port := defaultPorts[proto]
	if p := target.Port(); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil {
			port = parsed
		}
	}
	if !shouldProxy(hostname, port) {
		return ""
	}
	proxy := firstOf(
		envAnyCase("npm_config_"+proto+"_proxy"),
		envAnyCase(proto+"_proxy"),
		envAnyCase("npm_config_proxy"),
		envAnyCase("all_proxy"),
	)
	if proxy != "" && !strings.Contains(proxy, "://") {
		proxy = proto + "://" + proxy
	}
	return proxy
}

// shouldProxy ports proxy-from-env's shouldProxy: the NO_PROXY ruleset.
// A "*" alone proxies nothing; a leading "." or "*" is a suffix match;
// "host:port" only applies to that port; anything else is an exact host match.
func shouldProxy(hostname string, port int) bool {
	noProxy := strings.ToLower(firstOf(envAnyCase("npm_config_no_proxy"), envAnyCase("no_proxy")))
	if noProxy == "" {
		return true
	}
	if noProxy == "*" {
		return false
	}
	for _, entry := range strings.FieldsFunc(noProxy, func(r rune) bool {
		return r == ',' || r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '\f' || r == '\v'
	}) {
		if entry == "" {
			continue
		}
		entryHost := entry
		if idx := strings.LastIndex(entry, ":"); idx > 0 {
			if entryPort, err := strconv.Atoi(entry[idx+1:]); err == nil {
				if entryPort != port {
					continue // rule is for a different port
				}
				entryHost = entry[:idx]
			}
		}
		if !strings.HasPrefix(entryHost, ".") && !strings.HasPrefix(entryHost, "*") {
			if hostname == entryHost {
				return false
			}
			continue
		}
		suffix := strings.TrimPrefix(entryHost, "*")
		if strings.HasSuffix(hostname, suffix) {
			return false
		}
	}
	return true
}

// firstEnv returns the first non-empty value among the named variables, in the
// order proxy-agent.ts reads them (UPPER_CASE first, then lower_case).
func firstEnv(names ...string) string {
	for _, n := range names {
		if v := os.Getenv(n); v != "" {
			return v
		}
	}
	return ""
}

// envAnyCase ports proxy-from-env's getEnv, which checks lower case first.
func envAnyCase(key string) string {
	if v := os.Getenv(strings.ToLower(key)); v != "" {
		return v
	}
	return os.Getenv(strings.ToUpper(key))
}

func firstOf(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

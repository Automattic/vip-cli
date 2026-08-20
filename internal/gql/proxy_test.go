package gql

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestClientHonoursVIPProxy pins cutover item 2.14 on the path that carries the
// bearer token. gql.Client defaulted to http.DefaultClient, which ignores
// VIP_PROXY/SOCKS_PROXY entirely (a SOCKS user connected direct and never knew)
// and honours HTTPS_PROXY unconditionally (a user who declined system-proxy use
// had their token routed through a corporate proxy Node bypasses).
//
// The target is a live loopback server and the proxy a closed port. Neither
// net/http nor x/net's httpproxy will ever proxy a loopback host, so reaching
// the server proves the request went direct; Node's proxy-from-env has no such
// exemption, so the request must be attempted through the dead SOCKS port.
func TestClientHonoursVIPProxy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{}}`))
	}))
	defer srv.Close()

	for _, k := range []string{
		"SOCKS_PROXY", "socks_proxy", "HTTPS_PROXY", "https_proxy",
		"HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy",
		"NO_PROXY", "no_proxy", "VIP_USE_SYSTEM_PROXY", "vip_proxy",
	} {
		t.Setenv(k, "")
	}
	t.Setenv("VIP_PROXY", "socks5://"+closedAddr(t))

	c := NewClient(Config{APIHost: srv.URL, Token: "bearer-token-under-test"})
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/graphql",
		strings.NewReader(`{"operationName":"Me","query":"{me{id}}"}`))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}

	resp, err := c.Do(req)
	if err == nil {
		_ = resp.Body.Close()
		t.Fatal("GraphQL request succeeded; VIP_PROXY was ignored and the bearer token went direct")
	}
}

func closedAddr(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := l.Addr().String()
	if err := l.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	return addr
}

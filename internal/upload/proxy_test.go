package upload

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestPresignRequestHonoursVIPProxy pins cutover item 2.14 on the second path
// that carries the bearer token: POST /upload/site-import-presigned-url. The
// default client was http.DefaultClient, which ignores VIP_PROXY/SOCKS_PROXY
// and honours HTTPS_PROXY without the VIP_USE_SYSTEM_PROXY opt-in Node requires.
//
// Live loopback target, closed SOCKS port: no Go proxy resolver would ever
// proxy a loopback host, so reaching the server proves the request went direct.
func TestPresignRequestHonoursVIPProxy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"url":"https://s3.example/x","options":{"method":"PUT","headers":{}}}`))
	}))
	defer srv.Close()

	for _, k := range []string{
		"SOCKS_PROXY", "socks_proxy", "HTTPS_PROXY", "https_proxy",
		"HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy",
		"NO_PROXY", "no_proxy", "VIP_USE_SYSTEM_PROXY", "vip_proxy",
		"WPVIP_DEPLOY_TOKEN",
	} {
		t.Setenv(k, "")
	}
	t.Setenv("VIP_PROXY", "socks5://"+closedProxyAddr(t))

	c := &Client{APIHost: srv.URL, Token: "bearer-token-under-test"}
	_, err := c.GetSignedUploadRequestData(context.Background(), SignedRequestArgs{
		Action: "AssertMultipartUpload", AppID: 1, EnvID: 2, BaseName: "x.sql",
	})
	if err == nil {
		t.Fatal("presign request succeeded; VIP_PROXY was ignored and the bearer token went direct")
	}
}

func closedProxyAddr(t *testing.T) string {
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

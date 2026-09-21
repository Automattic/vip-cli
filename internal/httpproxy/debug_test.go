package httpproxy

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestProxyDiagnosticOmitsCredentials(t *testing.T) {
	clearProxyEnv(t)
	t.Setenv("VIP_PROXY", "socks5://user:proxy-secret@localhost:1080")
	var out bytes.Buffer
	ctx := debuglog.WithLogger(context.Background(), "vip:proxy-dispatcher", &out)
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://example.test/graphql?token=request-secret", nil)
	u, err := ProxyURL(req)
	if err != nil {
		t.Fatal(err)
	}
	if u == nil || u.User == nil {
		t.Fatal("proxy authentication lost")
	}
	if !strings.Contains(out.String(), "socks5://localhost:1080") {
		t.Fatalf("missing proxy diagnostic: %q", out.String())
	}
	if strings.Contains(out.String(), "secret") || strings.Contains(out.String(), "user") {
		t.Fatalf("credentials exposed: %q", out.String())
	}
}

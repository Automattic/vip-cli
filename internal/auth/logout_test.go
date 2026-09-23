package auth

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestPostLogoutSendsBearer(t *testing.T) {
	var gotAuth, gotMethod, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotMethod, gotPath = r.Header.Get("Authorization"), r.Method, r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	if err := PostLogout(srv.URL, "rawtok"); err != nil {
		t.Fatalf("PostLogout: %v", err)
	}
	if gotAuth != "Bearer rawtok" || gotMethod != http.MethodPost || gotPath != "/logout" {
		t.Errorf("got %q %q %q", gotMethod, gotPath, gotAuth)
	}
}

func TestPostLogoutContextDiagnostics(t *testing.T) {
	for _, key := range []string{"VIP_PROXY", "vip_proxy", "SOCKS_PROXY", "socks_proxy", "NO_PROXY", "no_proxy"} {
		t.Setenv(key, "")
	}
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/logout" || r.Header.Get("Authorization") != "Bearer fixture-token-secret" {
			t.Error("logout request changed")
		}
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("server-body-secret"))
	}))
	defer proxy.Close()
	t.Setenv("VIP_USE_SYSTEM_PROXY", "1")
	t.Setenv("HTTPS_PROXY", strings.Replace(proxy.URL, "http://", "http://proxy-user:proxy-password-secret@", 1))
	for _, namespaces := range []string{"", "@automattic/vip:http,vip:proxy-dispatcher"} {
		t.Run(namespaces, func(t *testing.T) {
			var out bytes.Buffer
			ctx := debuglog.WithLogger(context.Background(), namespaces, &out)
			if err := PostLogoutContext(ctx, "http://url-user:url-password-secret@logout.example.test", "fixture-token-secret"); err != nil {
				t.Fatal(err)
			}
			if namespaces == "" {
				if out.Len() != 0 {
					t.Fatalf("default diagnostics = %q", out.String())
				}
				return
			}
			for _, want := range []string{"@automattic/vip:http running fetch http://logout.example.test/logout", "vip:proxy-dispatcher Enabling fetch dispatcher proxy support using config: " + proxy.URL} {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q in %q", want, out.String())
				}
			}
			for _, forbidden := range []string{"secret", "proxy-user", "url-user", "Authorization"} {
				if strings.Contains(out.String(), forbidden) {
					t.Errorf("diagnostics exposed %q: %q", forbidden, out.String())
				}
			}
		})
	}
}

func TestPostLogoutIgnoresServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	if err := PostLogout(srv.URL, "tok"); err != nil {
		t.Errorf("5xx should be ignored, got %v", err)
	}
}

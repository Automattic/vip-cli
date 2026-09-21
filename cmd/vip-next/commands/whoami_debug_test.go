package commands

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestWhoamiCommandHTTPDebug(t *testing.T) {
	t.Setenv("VIP_PROXY", "")
	t.Setenv("WPVIP_DEPLOY_TOKEN", "")
	previous := GetConfig()
	t.Cleanup(func() { SetConfig(previous) })

	for _, tc := range []struct {
		name       string
		namespaces string
		wantDebug  bool
	}{
		{name: "enabled", namespaces: "@automattic/vip:http", wantDebug: true},
		{name: "disabled"},
		{name: "excluded", namespaces: "*,-@automattic/vip:http"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			const token = "whoami-test-bearer-secret"
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPost || r.URL.Path != "/graphql" {
					t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
				}
				if got := r.Header.Get("Authorization"); got != "Bearer "+token {
					t.Error("request did not retain the configured bearer token")
				}
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Errorf("read request: %v", err)
				}
				if string(body) != `{"operationName":"Me","query":"query Me {\n  me {\n    id\n    displayName\n    isVIP\n  }\n}"}` {
					t.Errorf("unexpected request body: %s", body)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, `{"data":{"me":{"id":42,"displayName":"private-user@example.test","isVIP":true}}}`)
			}))
			defer srv.Close()
			SetConfig(Config{APIHost: srv.URL, Token: token})

			var stdout, stderr bytes.Buffer
			cmd := NewWhoamiCmd()
			cmd.SetArgs(nil)
			cmd.SetOut(&stdout)
			cmd.SetErr(&stderr)
			ctx := debuglog.WithLogger(context.Background(), tc.namespaces, &stderr)
			if err := cmd.ExecuteContext(ctx); err != nil {
				t.Fatalf("execute whoami: %v", err)
			}
			wantDebug := ""
			if tc.wantDebug {
				wantDebug = "@automattic/vip:http running fetch " + srv.URL + "/graphql\n"
			}
			if got := stderr.String(); got != wantDebug {
				t.Errorf("diagnostics = %q, want %q", got, wantDebug)
			}
			const wantOutput = "- Howdy private-user@example.test!\n- Your user ID is 42\n- Your account has VIP Staff permissions\n"
			if got := stdout.String(); got != wantOutput {
				t.Errorf("stdout = %q, want %q", got, wantOutput)
			}
			for _, secret := range []string{token, "private-user@example.test", "displayName", "query Me", "Authorization"} {
				if strings.Contains(stderr.String(), secret) {
					t.Errorf("diagnostics exposed %q", secret)
				}
			}
		})
	}
}

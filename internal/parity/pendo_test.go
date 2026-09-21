//go:build parity

package parity

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	json "encoding/json/v2"
	"github.com/Automattic/vip/internal/debuglog"
	"github.com/Automattic/vip/internal/telemetry"
)

// Compare the real clients and HTTP stacks against an authenticated local
// endpoint. Only credential lookup is injected; no real analytics or user
// keychain is touched. The ordinary CLI parity harness disables telemetry.
func TestPendoClientParity(t *testing.T) {
	node := ResolveNodeVipBin(os.Getenv("NODE_VIP_BIN"), DefaultNodeVipBinProbe())
	if !node.Ready {
		t.Skip(LoudSkip("Pendo real Node-vs-Go client comparison", node.Reason))
	}
	dist := filepath.Dir(filepath.Dir(node.Path))
	for _, tc := range []struct {
		name   string
		status int
		token  string
	}{
		{"accepted", 200, "credential-sentinel"},
		{"unauthorized", 401, "credential-sentinel"},
		{"server-error", 500, "credential-sentinel"},
		{"no-token", 200, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var observations [2][]map[string]any
			for side := range 2 {
				srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					body, _ := io.ReadAll(r.Body)
					var payload map[string]any
					if err := json.Unmarshal(body, &payload); err != nil {
						t.Error(err)
					}
					if payload["timestamp"] == nil {
						t.Error("missing timestamp")
					}
					delete(payload, "timestamp")
					observations[side] = append(observations[side], map[string]any{"path": r.URL.Path, "method": r.Method, "auth": r.Header.Get("Authorization"), "payload": payload})
					status := tc.status
					if r.Header.Get("Authorization") != "Bearer credential-sentinel" {
						status = http.StatusUnauthorized
					}
					w.WriteHeader(status)
					_, _ = w.Write([]byte("response-sentinel"))
				}))
				var diagnostics bytes.Buffer
				if side == 0 {
					const script = `
const path = require('path');
const dist = process.argv[1];
const Token = require(path.join(dist, 'lib/token.js')).default;
Token.get = async () => ({ raw: process.env.PENDO_FIXTURE_TOKEN });
const Pendo = require(path.join(dist, 'lib/analytics/clients/pendo.js')).default;
const c = new Pendo({ userId: 'visitor-sentinel', eventPrefix: 'vip_cli_', env: { userAgent: 'fixture' } });
c.trackEvent('test', { org_slug: 'org-sentinel', org_sfid: 'account-sentinel' }).then(result => {
  process.stdout.write(result === false ? 'failed' : 'accepted');
}).catch(() => { process.exitCode = 1; });
`
					ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
					cmd := exec.CommandContext(ctx, "node", "-e", script, dist)
					cmd.Env = ScenarioEnv(os.Environ(), map[string]string{"API_HOST": srv.URL, "PENDO_FIXTURE_TOKEN": tc.token, "DEBUG": "@automattic/vip:analytics:clients:pendo"})
					cmd.Stderr = &diagnostics
					out, err := cmd.Output()
					cancel()
					if err != nil {
						srv.Close()
						t.Fatalf("Node: %v\n%s", err, &diagnostics)
					}
					want := "failed"
					if tc.token != "" && tc.status == 200 {
						want = "accepted"
					}
					if string(out) != want {
						t.Errorf("Node delivery result=%s, want %s", out, want)
					}
				} else {
					c := &telemetry.PendoClient{Endpoint: srv.URL + "/pendo", HTTP: srv.Client(), UserID: "visitor-sentinel", UserAgent: "fixture", EventPrefix: "vip_cli_", GetToken: func() (string, error) { return tc.token, nil }, Context: debuglog.WithLogger(context.Background(), "@automattic/vip:analytics:clients:pendo", &diagnostics)}
					err := c.TrackEvent("test", map[string]any{"org_slug": "org-sentinel", "org_sfid": "account-sentinel"})
					if (err != nil) != (tc.token != "" && tc.status != 200) {
						t.Errorf("Go delivery error=%v for HTTP %d", err, tc.status)
					}
				}
				srv.Close()
				wantRequests := 1
				if tc.token == "" {
					wantRequests = 0
				}
				if len(observations[side]) != wantRequests {
					t.Errorf("side %d requests=%d, want %d", side, len(observations[side]), wantRequests)
				}
				if tc.token != "" && !strings.Contains(diagnostics.String(), fmt.Sprint(tc.status)) {
					t.Errorf("side %d missing HTTP status: %s", side, &diagnostics)
				}
				if strings.Contains(diagnostics.String(), "sentinel") {
					t.Errorf("side %d exposed private data: %s", side, &diagnostics)
				}
			}
			if !reflect.DeepEqual(observations[0], observations[1]) {
				t.Errorf("request mismatch: Node=%v Go=%v", observations[0], observations[1])
			}
		})
	}
}

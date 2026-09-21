package wpstream

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/debuglog"
	"github.com/coder/websocket"
)

// Exercise the real transport, including a server-requested retry and reconnect.
func TestSocketDiagnosticsRetryAndExitExcludeSessionData(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		var connections atomic.Int32
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Query().Get("transport") == "polling" {
				fmt.Fprint(w, `0{"sid":"secret-session","upgrades":["websocket"],"pingInterval":20000,"pingTimeout":20000}`)
				return
			}
			c, err := websocket.Accept(w, r, nil)
			if err != nil {
				return
			}
			defer c.CloseNow()
			ctx := r.Context()
			_, probe, err := c.Read(ctx)
			if err != nil || string(probe) != "2probe" {
				return
			}
			if c.Write(ctx, websocket.MessageText, []byte("3probe")) != nil {
				return
			}
			if _, _, err = c.Read(ctx); err != nil {
				return
			}
			if _, _, err = c.Read(ctx); err != nil {
				return
			}
			if c.Write(ctx, websocket.MessageText, []byte("40/wp-cli,")) != nil {
				return
			}
			attempt := connections.Add(1)
			for {
				_, data, err := c.Read(ctx)
				if err != nil {
					return
				}
				if !strings.Contains(string(data), `"cmd"`) {
					continue
				}
				if attempt == 1 {
					_ = c.Write(ctx, websocket.MessageText, []byte(`42/wp-cli,["retry",{"message":"secret-retry"}]`))
					_ = c.Write(ctx, websocket.MessageText, []byte("41/wp-cli,"))
				} else {
					_ = c.Write(ctx, websocket.MessageText, []byte(`42/wp-cli,["exit",{"exitCode":7,"message":"secret-server-output"}]`))
				}
			}
		}))
		var stdout, diagnostics bytes.Buffer
		selector := ""
		if enabled {
			selector = "@automattic/vip:wp"
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		res, err := Run(debuglog.WithLogger(ctx, selector, &diagnostics), Options{APIHost: srv.URL, Token: "secret-token", GUID: "secret-guid", InputToken: "secret-input", Stdin: strings.NewReader(""), Stdout: &stdout, Stderr: io.Discard})
		cancel()
		srv.Close()
		if err != nil || res.ExitCode != 7 {
			t.Fatalf("result=%+v err=%v", res, err)
		}
		if stdout.String() != "secret-server-output\n" {
			t.Fatalf("stdout changed: %q", stdout.String())
		}
		if !enabled {
			if diagnostics.Len() != 0 {
				t.Fatalf("default diagnostics: %q", diagnostics.String())
			}
			continue
		}
		for _, stage := range []string{"socket: connect attempt=1", "socket: connected", "socket: retry", "socket.io: reconnect", "socket: connect attempt=2", "socket: exit code=7"} {
			if !strings.Contains(diagnostics.String(), stage) {
				t.Errorf("missing %q in %q", stage, diagnostics.String())
			}
		}
		if strings.Contains(diagnostics.String(), "secret-") || strings.Contains(diagnostics.String(), srv.URL) {
			t.Fatalf("session data in diagnostics: %q", diagnostics.String())
		}
	}
}

func TestSocketDiagnosticsConnectionErrorDoesNotPrintResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "secret-server-error", http.StatusForbidden)
	}))
	defer srv.Close()
	var diagnostics bytes.Buffer
	ctx := debuglog.WithLogger(context.Background(), "@automattic/vip:wp", &diagnostics)
	_, err := Run(ctx, Options{APIHost: srv.URL, Token: "secret-token"})
	if err == nil {
		t.Fatal("expected handshake error")
	}
	if !strings.Contains(diagnostics.String(), "socket: connect_error stage=transport") {
		t.Fatalf("missing failure stage: %q", diagnostics.String())
	}
	if strings.Contains(diagnostics.String(), "secret-") || strings.Contains(diagnostics.String(), srv.URL) {
		t.Fatalf("private data in diagnostics: %q", diagnostics.String())
	}
}

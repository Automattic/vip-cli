//go:build parity

package parity

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	gossh "golang.org/x/crypto/ssh"
)

// wpMux builds a GraphQL handler for the vip wp scenarios.
//
// recordingDir selects the resolve-app.json fixture (per-scenario dir).
// wpEnvInfoBody is the JSON to return for WPEnvInfo (built per-scenario).
// triggerBody is the JSON to return for TriggerWPCLICommand (built per-scenario,
// or nil if the mutation must not fire — the counter still increments so the
// test can assert 0 hits).
func wpMux(
	t *testing.T,
	recordingDir string,
	wpEnvInfoBody []byte,
	triggerBody []byte,
) (http.Handler, func() int32) {
	t.Helper()
	shared := "../../testdata/parity/recordings/m7c-shared/"
	base := "../../testdata/parity/recordings/" + recordingDir + "/"

	read := func(name string) []byte {
		if b, err := os.ReadFile(base + name); err == nil {
			return b
		}
		if b, err := os.ReadFile(shared + name); err == nil {
			return b
		}
		return nil
	}

	nullBody := []byte(`{"data":null}`)
	serve := func(w http.ResponseWriter, body []byte) {
		if body == nil {
			body = nullBody
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}

	var triggerHits int32

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		switch {
		case strings.Contains(s, `"operationName":"ResolveAppByName"`),
			strings.Contains(s, `"operationName":"ResolveAppByID"`):
			serve(w, read("resolve-app.json"))
		case strings.Contains(s, `"operationName":"WPEnvInfo"`):
			serve(w, wpEnvInfoBody)
		case strings.Contains(s, `"operationName":"TriggerWPCLICommand"`):
			atomic.AddInt32(&triggerHits, 1)
			serve(w, triggerBody)
		default:
			serve(w, nil)
		}
	})

	return handler, func() int32 { return atomic.LoadInt32(&triggerHits) }
}

// wpEnvInfoJSON builds the WPEnvInfo response body.
func wpEnvInfoJSON(typeID int64, wpcliStrategy, envType string) []byte {
	strategyField := "null"
	if wpcliStrategy != "" {
		strategyField = `"` + wpcliStrategy + `"`
	}
	return []byte(fmt.Sprintf(
		`{"data":{"app":{"id":42,"name":"parityapp","typeId":%d,"environments":[{"id":7,"appId":42,"type":%q,"name":"develop","wpcliStrategy":%s,"primaryDomain":{"name":"d.example"}}]}}}`,
		typeID, envType, strategyField,
	))
}

// wpEnvInfoJSONProd builds the WPEnvInfo response body for production envs.
func wpEnvInfoJSONProd(typeID int64, wpcliStrategy string) []byte {
	strategyField := "null"
	if wpcliStrategy != "" {
		strategyField = `"` + wpcliStrategy + `"`
	}
	return []byte(fmt.Sprintf(
		`{"data":{"app":{"id":42,"name":"parityapp","typeId":%d,"environments":[{"id":1,"appId":42,"type":"production","name":"production","wpcliStrategy":%s,"primaryDomain":{"name":"p.example"}}]}}}`,
		typeID, strategyField,
	))
}

// testClientKeyPEM generates a fresh ed25519 private key as an OpenSSH PEM
// (the format ssh.ParsePrivateKey accepts).
func wpTestClientKeyPEM(t *testing.T) string {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate ed25519 key: %v", err)
	}
	block, err := gossh.MarshalPrivateKey(priv, "")
	if err != nil {
		t.Fatalf("marshal private key: %v", err)
	}
	return string(pem.EncodeToMemory(block))
}

// startWPEchoSSHServer starts an in-process SSH echo server (copied/adapted
// from internal/wpssh/wpssh_test.go). On each "exec" request it writes the
// command string back to stdout and exits 0.
func startWPEchoSSHServer(t *testing.T) (host, port string) {
	t.Helper()

	_, hostPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate host key: %v", err)
	}
	hostSigner, err := gossh.NewSignerFromKey(hostPriv)
	if err != nil {
		t.Fatalf("new host signer: %v", err)
	}

	cfg := &gossh.ServerConfig{
		NoClientAuth: true, // accept any client key
	}
	cfg.AddHostKey(hostSigner)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { ln.Close() })

	addr := ln.Addr().String()
	host, port, err = net.SplitHostPort(addr)
	if err != nil {
		t.Fatalf("split host/port: %v", err)
	}

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go wpHandleSSHConn(conn, cfg)
		}
	}()

	return host, port
}

func wpHandleSSHConn(conn net.Conn, cfg *gossh.ServerConfig) {
	srvConn, chans, reqs, err := gossh.NewServerConn(conn, cfg)
	if err != nil {
		return
	}
	defer srvConn.Close()
	go gossh.DiscardRequests(reqs)

	for newChan := range chans {
		if newChan.ChannelType() != "session" {
			_ = newChan.Reject(gossh.UnknownChannelType, "unknown channel type")
			continue
		}
		ch, requests, err := newChan.Accept()
		if err != nil {
			return
		}
		go wpHandleSession(ch, requests)
	}
}

type wpExecPayload struct {
	Command string
}

func wpHandleSession(ch gossh.Channel, requests <-chan *gossh.Request) {
	defer ch.Close()
	for req := range requests {
		if req.Type != "exec" {
			if req.WantReply {
				_ = req.Reply(false, nil)
			}
			continue
		}
		var payload wpExecPayload
		if err := gossh.Unmarshal(req.Payload, &payload); err != nil {
			if req.WantReply {
				_ = req.Reply(false, nil)
			}
			return
		}
		if req.WantReply {
			_ = req.Reply(true, nil)
		}
		// Echo the command string to stdout so the caller can assert the preamble.
		_, _ = fmt.Fprint(ch, payload.Command)
		exitMsg := gossh.Marshal(struct{ Code uint32 }{0})
		_, _ = ch.SendRequest("exit-status", false, exitMsg)
		return
	}
}

// triggerSSHResponse builds the TriggerWPCLICommand response JSON that points
// the SSH auth at the in-process echo server. All string values are formatted
// with %q so newlines and special characters in the PEM are properly escaped.
func triggerSSHResponse(host, port, privateKeyPEM string) []byte {
	return []byte(fmt.Sprintf(
		`{"data":{"triggerWPCLICommandOnAppEnvironment":{"inputToken":"tok-parity","command":{"guid":"parity-guid-001"},"sshAuthentication":{"host":%q,"port":%q,"username":"wpuser","privateKey":%q,"passphrase":""}}}}`,
		host, port, privateKeyPEM,
	))
}

// baseWPEnv returns a common env map for all wp parity scenarios.
func baseWPEnv() map[string]string {
	return map[string]string{
		"DO_NOT_TRACK": "1",
		"NODE_ENV":     "test",
		"NO_COLOR":     "1",
	}
}

// TestWPScenarios runs the five vip wp parity scenarios.
func TestWPScenarios(t *testing.T) {
	goBin := buildVipNextWithVersion(t, "test", "test")

	// ── 1. wp-help ────────────────────────────────────────────────────────────
	// `vip help wp` bypasses auth and prints the wp command's help text.
	// Note: `vip wp --help` does NOT work because DisableFlagParsing passes
	// --help through as a raw WP-CLI arg and the appctx middleware fires first.
	// `vip help wp` routes through cobra's built-in help path which does NOT
	// invoke the command's RunE and therefore bypasses the appctx middleware.
	t.Run("wp-help", func(t *testing.T) {
		env := baseWPEnv()
		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"help", "wp"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 0 {
			t.Errorf("exit=%d, want 0\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		if !strings.Contains(combined, "wp") {
			t.Errorf("help output missing 'wp':\n%s", combined)
		}
	})

	// ── 2. wp-nodejs-rejected ─────────────────────────────────────────────────
	// WPEnvInfo returns typeId:3 (Node.js) → exit 1, error message, no trigger.
	t.Run("wp-nodejs-rejected", func(t *testing.T) {
		envInfoBody := wpEnvInfoJSON(3, "ssh", "develop")
		handler, triggerHits := wpMux(t, "wp-nodejs-rejected", envInfoBody, nil)
		srv := httptest.NewServer(handler)
		defer srv.Close()

		env := baseWPEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"@parityapp.develop", "wp", "user", "list"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 1 {
			t.Errorf("exit=%d, want 1\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		if !strings.Contains(combined, "WP-CLI commands are not supported on Node.js environments.") {
			t.Errorf("missing nodejs-rejection message:\n%s", combined)
		}
		if got := triggerHits(); got != 0 {
			t.Errorf("TriggerWPCLICommand hits = %d, want 0", got)
		}
	})

	// ── 3. wp-production-confirm-decline ─────────────────────────────────────
	// Production env + VIP_NON_INTERACTIVE=1 (no --yes) → confirm declines →
	// "Command cancelled" → exit 0. Trigger must NOT fire.
	t.Run("wp-production-confirm-decline", func(t *testing.T) {
		// Production WPEnvInfo: typeId 2 (WordPress), ssh strategy.
		envInfoBody := wpEnvInfoJSONProd(2, "ssh")
		handler, triggerHits := wpMux(t, "wp-production-confirm-decline", envInfoBody, nil)
		srv := httptest.NewServer(handler)
		defer srv.Close()

		env := baseWPEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)
		env["VIP_NON_INTERACTIVE"] = "1"

		// @parityapp.production → resolve-app.json in wp-production-confirm-decline
		// has type:production. No --yes flag passed.
		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"@parityapp.production", "wp", "user", "list"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 0 {
			t.Errorf("exit=%d, want 0\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		if !strings.Contains(combined, "Command cancelled") {
			t.Errorf("missing 'Command cancelled':\n%s", combined)
		}
		if got := triggerHits(); got != 0 {
			t.Errorf("TriggerWPCLICommand hits = %d, want 0", got)
		}
	})

	// ── 4. wp-ssh-happy ───────────────────────────────────────────────────────
	// Develop env, ssh strategy. The mutation returns ssh auth pointing at the
	// in-process echo server. Exit 0; output contains GUID= from the preamble.
	t.Run("wp-ssh-happy", func(t *testing.T) {
		sshHost, sshPort := startWPEchoSSHServer(t)

		// Generate a client key that the server will accept (NoClientAuth=true).
		clientKeyPEM := wpTestClientKeyPEM(t)

		triggerResp := triggerSSHResponse(sshHost, sshPort, clientKeyPEM)
		envInfoBody := wpEnvInfoJSON(2, "ssh", "develop")
		handler, triggerHits := wpMux(t, "wp-ssh-happy", envInfoBody, triggerResp)
		srv := httptest.NewServer(handler)
		defer srv.Close()

		env := baseWPEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

		// Use --yes to skip any production confirm (develop doesn't need it,
		// but included for clarity). Pass a simple wp subcommand.
		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"@parityapp.develop", "--yes", "wp", "user", "list"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.ExitCode != 0 {
			t.Errorf("exit=%d, want 0\n  stderr: %s\n  stdout: %s",
				res.ExitCode, res.Stderr, res.Stdout)
		}
		combined := res.Stdout + res.Stderr
		// The echo server writes the exec preamble to stdout, which includes GUID=.
		if !strings.Contains(combined, "GUID=parity-guid-001") {
			t.Errorf("missing GUID= in exec preamble:\n%s", combined)
		}
		if got := triggerHits(); got != 1 {
			t.Errorf("TriggerWPCLICommand hits = %d, want 1", got)
		}
	})

	// ── 5. wp-socketio-reaches-trigger ───────────────────────────────────────
	// Develop env, websocket strategy (WP2). The binary enters the wpstream
	// path and fires TriggerWPCLICommand (triggerHits == 1). The GraphQL mux
	// has NO /socket.io/ endpoint, so wpstream.Run → Dial will fail and the
	// process exits non-zero. We verify:
	//   • exit code != 0 (connection failure — exact code is env-dependent)
	//   • combined output does NOT contain "requires the Node CLI" (redirect gone)
	//   • trigger fired exactly once (we entered the wpstream path)
	//
	// Full-binary socket.io e2e is handled by internal/wpstream/e2e_test.go
	// (build tag: wpstream_e2e), which validates the wpstream stack end-to-end
	// against a real socket.io server via the Run API. The cmd wiring is
	// unit-tested in cmd/vip-next/commands/wp_test.go.
	t.Run("wp-socketio-reaches-trigger", func(t *testing.T) {
		envInfoBody := wpEnvInfoJSON(2, "websocket", "develop")
		// triggerWebsocketResponse returns a valid TriggerWPCLICommand payload
		// with inputToken + command.guid but no SSH auth (websocket envs).
		triggerBody := []byte(`{"data":{"triggerWPCLICommandOnAppEnvironment":{"inputToken":"tok-ws","command":{"guid":"ws-guid-001"},"sshAuthentication":null}}}`)
		handler, triggerHits := wpMux(t, "wp-socketio-reaches-trigger", envInfoBody, triggerBody)
		srv := httptest.NewServer(handler)
		defer srv.Close()

		env := baseWPEnv()
		env["API_HOST"] = srv.URL
		env["VIP_TOKEN_OVERRIDE"] = makeTestToken(t)

		res, err := Run(RunSpec{
			Binary: goBin,
			Argv:   []string{"@parityapp.develop", "--yes", "wp", "option", "get", "home"},
			Env:    FixtureEnv(env),
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		// The binary must fail (no real socket.io server), exit != 0.
		if res.ExitCode == 0 {
			t.Errorf("exit=0, want non-zero (wpstream dial should fail)\n  stderr: %s\n  stdout: %s",
				res.Stderr, res.Stdout)
		}
		// The WP1 redirect must be gone.
		combined := res.Stdout + res.Stderr
		if strings.Contains(combined, "requires the Node CLI") {
			t.Errorf("unexpected 'requires the Node CLI' in output (WP1 redirect should be gone):\n%s", combined)
		}
		// Trigger must have fired once — we entered the wpstream path.
		if got := triggerHits(); got != 1 {
			t.Errorf("TriggerWPCLICommand hits = %d, want 1", got)
		}
	})
}

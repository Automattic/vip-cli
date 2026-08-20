package wpssh_test

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"testing"

	gossh "golang.org/x/crypto/ssh"

	"github.com/Automattic/vip/internal/wpssh"
)

// testClientKeyPEM generates a fresh ed25519 private key and returns it as
// an OpenSSH PEM string (the format ssh.ParsePrivateKey accepts).
func testClientKeyPEM(t *testing.T) string {
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

// startEchoSSHServer stands up an in-process SSH server on a random local
// port. On each session it:
//  1. Accepts an "exec" channel request.
//  2. Writes the exec command string to the channel stdout so the test can
//     assert the preamble.
//  3. Sends an exit-status reply with exitCode.
//
// Returns host and port strings; t.Cleanup closes the listener.
func startEchoSSHServer(t *testing.T, exitCode int) (host, port string) {
	t.Helper()

	// Generate a host key.
	_, hostPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate host key: %v", err)
	}
	hostSigner, err := gossh.NewSignerFromKey(hostPriv)
	if err != nil {
		t.Fatalf("new host signer: %v", err)
	}

	cfg := &gossh.ServerConfig{
		NoClientAuth: true,
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
				return // listener closed
			}
			go handleSSHConn(conn, cfg, exitCode)
		}
	}()

	return host, port
}

func handleSSHConn(conn net.Conn, cfg *gossh.ServerConfig, exitCode int) {
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
		go handleSession(ch, requests, exitCode)
	}
}

// execPayload is the wire format for an "exec" request payload.
type execPayload struct {
	Command string
}

func handleSession(ch gossh.Channel, requests <-chan *gossh.Request, exitCode int) {
	defer ch.Close()

	for req := range requests {
		if req.Type != "exec" {
			if req.WantReply {
				_ = req.Reply(false, nil)
			}
			continue
		}

		// Decode the length-prefixed command string.
		var payload execPayload
		if err := gossh.Unmarshal(req.Payload, &payload); err != nil {
			if req.WantReply {
				_ = req.Reply(false, nil)
			}
			return
		}

		if req.WantReply {
			_ = req.Reply(true, nil)
		}

		// Echo the command string to stdout so the test can assert the preamble.
		_, _ = fmt.Fprint(ch, payload.Command)

		// Send exit-status before closing.
		exitMsg := gossh.Marshal(struct{ Code uint32 }{uint32(exitCode)})
		_, _ = ch.SendRequest("exit-status", false, exitMsg)
		return
	}
}

// --- Tests ------------------------------------------------------------------

func TestRunSSHHappyPath(t *testing.T) {
	host, port := startEchoSSHServer(t, 0)
	var stdout bytes.Buffer
	// Use separate writers for stdout and stderr: x/crypto/ssh copies them
	// concurrently, and sharing a single bytes.Buffer would race.
	err := wpssh.Run(context.Background(), wpssh.Auth{
		Host: host, Port: port, Username: "u", PrivateKey: testClientKeyPEM(t),
		GUID: "g1", InputToken: "tok",
	}, wpssh.Streams{Stdin: strings.NewReader(""), Stdout: &stdout, Stderr: io.Discard},
		wpssh.Meta{Version: "test", Rows: 15, Columns: 100, TTY: false})
	if err != nil {
		t.Fatal(err)
	}
	// The exec command string carries the env-var preamble (wp-ssh.ts:199).
	if !strings.Contains(stdout.String(), "GUID=g1") ||
		!strings.Contains(stdout.String(), "INPUT_TOKEN=tok") ||
		!strings.Contains(stdout.String(), "VERSION=test") {
		t.Errorf("exec line = %q", stdout.String())
	}
}

func TestRunSSHNonZeroExit(t *testing.T) {
	host, port := startEchoSSHServer(t, 3)
	var stdout bytes.Buffer
	err := wpssh.Run(context.Background(), wpssh.Auth{
		Host: host, Port: port, Username: "u", PrivateKey: testClientKeyPEM(t), GUID: "g", InputToken: "t",
	},
		wpssh.Streams{Stdin: strings.NewReader(""), Stdout: &stdout, Stderr: io.Discard},
		wpssh.Meta{Version: "test", Rows: 15, Columns: 100})
	var ec *wpssh.ExitCodeError
	if !errors.As(err, &ec) || ec.Code != 3 {
		t.Fatalf("err = %v, want exit-code 3", err)
	}
}

func TestRunSSHRefusedPort(t *testing.T) {
	// Find a port that's definitely not listening.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	ln.Close() // close immediately so the port is refused

	host, port, _ := net.SplitHostPort(addr)
	var stdout bytes.Buffer
	err = wpssh.Run(context.Background(), wpssh.Auth{
		Host: host, Port: port, Username: "u", PrivateKey: testClientKeyPEM(t),
	},
		wpssh.Streams{Stdin: strings.NewReader(""), Stdout: &stdout, Stderr: io.Discard},
		wpssh.Meta{Version: "test", Rows: 15, Columns: 100})
	if err == nil {
		t.Fatal("expected error connecting to closed port, got nil")
	}
}

package wpssh_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
	"github.com/Automattic/vip/internal/wpssh"
)

func TestSSHDiagnosticsPreserveOutputAndExcludeSessionData(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		for _, code := range []int{0, 7} {
			host, port := startEchoSSHServer(t, code)
			key := testClientKeyPEM(t)
			var out, diagnostics bytes.Buffer
			selector := ""
			if enabled {
				selector = "@automattic/vip:wp/ssh"
			}
			ctx := debuglog.WithLogger(context.Background(), selector, &diagnostics)
			err := wpssh.Run(ctx, wpssh.Auth{Host: host, Port: port, Username: "secret-user", PrivateKey: key, GUID: "secret-guid", InputToken: "secret-token"}, wpssh.Streams{Stdin: strings.NewReader(""), Stdout: &out, Stderr: io.Discard}, wpssh.Meta{Version: "test", Rows: 15, Columns: 100})
			var ec *wpssh.ExitCodeError
			if code == 0 && err != nil || code != 0 && (!errors.As(err, &ec) || ec.Code != code) {
				t.Fatalf("exit %d: %v", code, err)
			}
			if out.String() != "GUID=secret-guid INPUT_TOKEN=secret-token VERSION=test ROWS=15 COLUMNS=100 TTY=false" {
				t.Fatalf("stdout changed: %q", out.String())
			}
			if !enabled {
				if diagnostics.Len() != 0 {
					t.Fatalf("default diagnostics: %s", &diagnostics)
				}
				continue
			}
			for _, stage := range []string{"Connecting to SSH", "SSH connected", "SSH exit code="} {
				if !strings.Contains(diagnostics.String(), stage) {
					t.Errorf("missing %q in %q", stage, diagnostics.String())
				}
			}
			for _, sensitive := range []string{host, port, "secret-user", key, "secret-guid", "secret-token", "GUID="} {
				if strings.Contains(diagnostics.String(), sensitive) {
					t.Errorf("diagnostics disclose session data %q", sensitive)
				}
			}
		}
	}
}

func TestSSHDiagnosticsKeyFailureDoesNotPrintKeyOrPassphrase(t *testing.T) {
	var diagnostics bytes.Buffer
	ctx := debuglog.WithLogger(context.Background(), "@automattic/vip:wp/ssh", &diagnostics)
	err := wpssh.Run(ctx, wpssh.Auth{PrivateKey: "secret-private-key", Passphrase: "secret-passphrase"}, wpssh.Streams{}, wpssh.Meta{})
	if err == nil {
		t.Fatal("expected invalid key error")
	}
	if !strings.Contains(diagnostics.String(), "SSH authentication key rejected") {
		t.Fatalf("missing stage: %q", diagnostics.String())
	}
	if strings.Contains(diagnostics.String(), "secret-") {
		t.Fatalf("secret in diagnostics: %q", diagnostics.String())
	}
}

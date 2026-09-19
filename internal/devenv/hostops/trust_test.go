package hostops

import (
	"reflect"
	"strings"
	"testing"
)

func TestTrustCommandWindowsCertutil(t *testing.T) {
	argv, err := trustCommand("windows", `C:\tmp\ca.pem`)
	if err != nil {
		t.Fatalf("trustCommand windows: %v", err)
	}
	joined := strings.Join(argv, " ")
	if !strings.Contains(joined, "certutil") || !strings.Contains(joined, "Root") {
		t.Fatalf("windows trust argv = %v", argv)
	}
}

func TestTrustCommandDarwin(t *testing.T) {
	argv, err := trustCommand("darwin", "/Users/me/.local/share/vip/dev-env/proxy/ca.pem")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"security", "add-trusted-cert", "-d", "-r", "trustRoot",
		"-k", "/Library/Keychains/System.keychain",
		"/Users/me/.local/share/vip/dev-env/proxy/ca.pem",
	}
	if !reflect.DeepEqual(argv, want) {
		t.Fatalf("got %v, want %v", argv, want)
	}
}

func TestTrustCommandUnsupported(t *testing.T) {
	if _, err := trustCommand("plan9", "/x/ca.pem"); err == nil {
		t.Fatal("expected unsupported-OS error")
	}
}

func TestUntrustCommandDarwin(t *testing.T) {
	argv, err := untrustCommand("darwin", "/x/ca.pem")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"security", "remove-trusted-cert", "-d", "/x/ca.pem"}
	if !reflect.DeepEqual(argv, want) {
		t.Fatalf("got %v, want %v", argv, want)
	}
}

func TestUntrustCommandUnsupported(t *testing.T) {
	if _, err := untrustCommand("plan9", "/x/ca.pem"); err == nil {
		t.Fatal("expected unsupported-OS error")
	}
}

func TestTrustStrategy(t *testing.T) {
	cases := []struct {
		ctx  ctxKind
		goos string
		want trustStrat
	}{
		{ctxWindows, "linux", trustWindows},   // WSL
		{ctxWindows, "windows", trustWindows}, // native Windows
		{ctxUnix, "darwin", trustDarwin},      // macOS
		{ctxUnix, "linux", trustNone},         // native Linux: trust unsupported
	}
	for _, c := range cases {
		if got := trustStrategy(c.ctx, c.goos); got != c.want {
			t.Fatalf("trustStrategy(%v,%q)=%v want %v", c.ctx, c.goos, got, c.want)
		}
	}
}

func TestCATrustedNativeLinuxIsNoOp(t *testing.T) {
	// On a unix (non-WSL) host with goos=linux, CA trust is unsupported, so
	// CATrusted reports true (skip trust) for a non-empty cert path — no exec.
	// NOTE: this test assumes the test host is not WSL (currentContext()==ctxUnix);
	// if currentContext() is ctxWindows here, skip.
	if currentContext() == ctxWindows {
		t.Skip("host resolves as windows/WSL context")
	}
	if !CATrusted("linux", "/nonexistent/ca.pem") {
		t.Fatal("native-linux CATrusted should be a no-op true (skip trust)")
	}
	if CATrusted("linux", "") {
		t.Fatal("empty caPath must be false")
	}
}

//go:build wpstream_e2e

package wpstream

import (
	"bufio"
	"bytes"
	"context"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// startFixtureServer spawns the Node socket.io fixture on a free port and waits
// for "LISTENING". Requires Node 22. Env knobs configure behavior.
func startFixtureServer(t *testing.T, env map[string]string) (apiHost string) {
	t.Helper()
	port := freePort(t)
	cmd := exec.Command("node", "internal/wpstream/testdata/fixture-server.js")
	cmd.Dir = repoRoot(t) // module root (dir containing go.mod)
	cmd.Env = append(envSlice(env), "PORT="+strconv.Itoa(port))
	stdout, _ := cmd.StdoutPipe()
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		t.Skipf("node not available: %v", err)
	}
	t.Cleanup(func() { _ = cmd.Process.Kill() })

	sc := bufio.NewScanner(stdout)
	ready := make(chan struct{})
	go func() {
		for sc.Scan() {
			if strings.Contains(sc.Text(), "LISTENING") {
				close(ready)
				return
			}
		}
	}()
	select {
	case <-ready:
	case <-time.After(10 * time.Second):
		t.Fatal("fixture server did not start")
	}
	return "http://127.0.0.1:" + strconv.Itoa(port)
}

// freePort finds an available TCP port on localhost.
func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("freePort: %v", err)
	}
	port := l.Addr().(*net.TCPAddr).Port
	_ = l.Close()
	return port
}

// repoRoot walks up from the test's working dir until it finds a directory
// containing go.mod (the module root).
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("repoRoot: Getwd: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("repoRoot: go.mod not found")
		}
		dir = parent
	}
}

// envSlice starts from os.Environ() and appends k=v for each map entry.
func envSlice(env map[string]string) []string {
	base := os.Environ()
	for k, v := range env {
		base = append(base, k+"="+v)
	}
	return base
}

func TestE2EHappyPathStdoutAndExit(t *testing.T) {
	apiHost := startFixtureServer(t, map[string]string{
		"SCRIPT_STDOUT": "hello from wp-cli\n",
		"EXIT_CODE":     "0",
	})
	var out bytes.Buffer
	res, err := Run(context.Background(), Options{
		APIHost: apiHost, Token: "test-token",
		GUID: "g", InputToken: "t",
		Stdin: strings.NewReader(""), Stdout: &out, Stderr: &out,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.ExitCode != 0 {
		t.Errorf("exit = %d", res.ExitCode)
	}
	if !strings.Contains(out.String(), "hello from wp-cli") {
		t.Errorf("stdout = %q", out.String())
	}
}

func TestE2ENonZeroExit(t *testing.T) {
	apiHost := startFixtureServer(t, map[string]string{
		"SCRIPT_STDOUT": "boom\n", "EXIT_CODE": "3", "EXIT_MESSAGE": "failed",
	})
	var out bytes.Buffer
	res, err := Run(context.Background(), Options{APIHost: apiHost, Token: "t", GUID: "g", InputToken: "t",
		Stdin: strings.NewReader(""), Stdout: &out, Stderr: &out})
	if err != nil {
		t.Fatal(err)
	}
	if res.ExitCode != 3 {
		t.Errorf("exit = %d, want 3", res.ExitCode)
	}
}

func TestE2EOffsetResumeAfterKill(t *testing.T) {
	apiHost := startFixtureServer(t, map[string]string{
		"SCRIPT_STDOUT": "0123456789ABCDEF", "KILL_AFTER": "8", "EXIT_CODE": "0",
	})
	var out bytes.Buffer
	res, err := Run(context.Background(), Options{APIHost: apiHost, Token: "t", GUID: "g", InputToken: "t",
		Stdin: strings.NewReader(""), Stdout: &out, Stderr: &out})
	if err != nil {
		t.Fatal(err)
	}
	if res.ExitCode != 0 {
		t.Errorf("exit = %d", res.ExitCode)
	}
	if out.String() != "0123456789ABCDEF" {
		t.Errorf("resumed stdout = %q, want full payload once", out.String())
	}
}

// TestE2EOffsetResumeMultipleKills verifies that the reconnect loop handles
// MORE THAN ONE disconnect correctly (C1 fix). The fixture kills the connection
// twice: after 8 bytes on the first attempt (offset=0→8), and after 8 bytes
// on the second attempt (offset=8→16). The third attempt delivers the remaining
// 8 bytes (offset=16→24) and emits exit 0. The full 24-byte payload must appear
// in Stdout exactly once.
func TestE2EOffsetResumeMultipleKills(t *testing.T) {
	apiHost := startFixtureServer(t, map[string]string{
		"SCRIPT_STDOUT": "0123456789ABCDEFGHIJKLMN",
		"KILL_AFTER":    "8",
		"KILL_TIMES":    "2",
		"EXIT_CODE":     "0",
	})
	var out bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	res, err := Run(ctx, Options{
		APIHost: apiHost, Token: "t", GUID: "g", InputToken: "t",
		Stdin: strings.NewReader(""), Stdout: &out, Stderr: &out,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.ExitCode != 0 {
		t.Errorf("exit = %d, want 0", res.ExitCode)
	}
	const want = "0123456789ABCDEFGHIJKLMN"
	if out.String() != want {
		t.Errorf("stdout = %q, want %q", out.String(), want)
	}
}

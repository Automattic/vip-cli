package dockercli

import (
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestDockerSocketHonorsNonUnixDockerHost(t *testing.T) {
	t.Setenv("DOCKER_HOST", "tcp://127.0.0.1:2375")
	got, err := DockerSocket()
	if err != nil {
		t.Fatalf("DockerSocket: %v", err)
	}
	if got != "tcp://127.0.0.1:2375" {
		t.Fatalf("got %q, want the tcp DOCKER_HOST passed through", got)
	}
}

func TestDockerSocketFindsUnixSocket(t *testing.T) {
	// Use a short base dir under /tmp rather than t.TempDir(): macOS limits
	// unix socket paths to ~104 bytes and t.TempDir() under $TMPDIR
	// (/var/folders/...) overflows it, which would silently skip this test
	// on the project's primary target platform. /tmp keeps the path short on
	// both macOS and Linux so the discovery + slash-normalization logic is
	// actually exercised.
	dir, err := os.MkdirTemp("/tmp", "ds")
	if err != nil {
		t.Skipf("cannot create short temp dir: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })

	sockPath := filepath.Join(dir, "d.sock")
	ln, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Skipf("cannot create unix socket: %v", err)
	}
	defer ln.Close()

	t.Setenv("DOCKER_HOST", "unix://"+sockPath)
	got, err := DockerSocket()
	if err != nil {
		t.Fatalf("DockerSocket: %v", err)
	}
	if got != sockPath {
		t.Fatalf("got %q, want %q", got, sockPath)
	}
	if _, err := os.Stat(sockPath); err != nil {
		t.Fatalf("socket should exist: %v", err)
	}
}

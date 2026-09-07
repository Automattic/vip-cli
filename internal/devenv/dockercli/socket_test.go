package dockercli

import (
	"errors"
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

func TestPodmanSocketCandidatesUsesXDGRuntimeDirThenMachinePath(t *testing.T) {
	t.Setenv("XDG_RUNTIME_DIR", "/run/user/1000")
	got := podmanSocketCandidates("/home/dev")
	want := []string{
		"/run/user/1000/podman/podman.sock",
		"/home/dev/.local/share/containers/podman/machine/podman.sock",
	}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("candidate %d = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestPodmanSocketCandidatesOmitsXDGWhenUnset(t *testing.T) {
	t.Setenv("XDG_RUNTIME_DIR", "")
	got := podmanSocketCandidates("/home/dev")
	if len(got) != 1 || got[0] != "/home/dev/.local/share/containers/podman/machine/podman.sock" {
		t.Fatalf("got %v, want only the machine socket path", got)
	}
}


func TestPodmanMachineSocketPathReturnsInspectedSocket(t *testing.T) {
	dir, err := os.MkdirTemp("/tmp", "pm")
	if err != nil {
		t.Skipf("cannot create short temp dir: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })

	sockPath := filepath.Join(dir, "machine.sock")
	ln, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Skipf("cannot create unix socket: %v", err)
	}
	defer ln.Close()

	got, err := PodmanMachineSocketPath(func() (string, error) { return sockPath + "\n", nil })
	if err != nil {
		t.Fatalf("PodmanMachineSocketPath: %v", err)
	}
	if got != sockPath {
		t.Fatalf("got %q, want %q", got, sockPath)
	}
}

func TestPodmanMachineSocketPathEmptyWhenNoMachineRunning(t *testing.T) {
	got, err := PodmanMachineSocketPath(func() (string, error) { return "", nil })
	if err != nil {
		t.Fatalf("PodmanMachineSocketPath: %v", err)
	}
	if got != "" {
		t.Fatalf("got %q, want empty when no machine is running", got)
	}
}

func TestPodmanMachineSocketPathPropagatesInspectError(t *testing.T) {
	inspectErr := errors.New("podman: command not found")
	_, err := PodmanMachineSocketPath(func() (string, error) { return "", inspectErr })
	if err == nil {
		t.Fatal("PodmanMachineSocketPath should propagate a genuine inspect failure")
	}
}

func TestDockerBinKeepsTodaysResolutionUnchangedWhenDockerIsPresent(t *testing.T) {
	lookPath := func(name string) (string, error) {
		if name == "docker" {
			return "/usr/local/bin/docker", nil
		}
		return "", errors.New("not found")
	}
	if got := DockerBin(lookPath); got != "" {
		t.Fatalf("got %q, want empty so the default docker resolution is untouched", got)
	}
}

func TestDockerBinResolvesPodmanWhenNoDockerBinaryExists(t *testing.T) {
	lookPath := func(name string) (string, error) {
		if name == "podman" {
			return "/opt/homebrew/bin/podman", nil
		}
		return "", errors.New("not found")
	}
	if got := DockerBin(lookPath); got != "podman" {
		t.Fatalf("got %q, want %q", got, "podman")
	}
}

func TestDockerBinEmptyWhenNeitherBinaryExists(t *testing.T) {
	lookPath := func(string) (string, error) { return "", errors.New("not found") }
	if got := DockerBin(lookPath); got != "" {
		t.Fatalf("got %q, want empty, preserving the could-not-be-located error path", got)
	}
}

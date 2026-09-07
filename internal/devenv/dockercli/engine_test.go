package dockercli

import (
	"errors"
	"os"
	"testing"
)

func readTestdata(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read testdata %q: %v", name, err)
	}
	return b
}

func runnerReturning(raw []byte, err error) InfoRunner {
	return func(string, ...string) ([]byte, error) { return raw, err }
}

func TestDetectEngineClassifiesDockerInfo(t *testing.T) {
	info, err := DetectEngine("docker", "/var/run/docker.sock", runnerReturning(readTestdata(t, "docker-info.json"), nil))
	if err != nil {
		t.Fatalf("DetectEngine: %v", err)
	}
	if info.Engine != EngineDocker {
		t.Fatalf("Engine = %q, want docker", info.Engine)
	}
	if info.ServerVersion != "27.3.1" {
		t.Fatalf("ServerVersion = %q, want 27.3.1", info.ServerVersion)
	}
	if !info.ComposePlugin {
		t.Fatal("ComposePlugin = false, want true (docker-info.json lists the compose plugin)")
	}
	if info.Rootless {
		t.Fatal("Rootless = true, want false for docker")
	}
}

func TestDetectEngineClassifiesPodmanInfo(t *testing.T) {
	info, err := DetectEngine("docker", "/run/user/1000/podman/podman.sock", runnerReturning(readTestdata(t, "podman-info.json"), nil))
	if err != nil {
		t.Fatalf("DetectEngine: %v", err)
	}
	if info.Engine != EnginePodman {
		t.Fatalf("Engine = %q, want podman", info.Engine)
	}
	if info.ServerVersion != "5.5.2" {
		t.Fatalf("ServerVersion = %q, want 5.5.2", info.ServerVersion)
	}
	if info.ComposePlugin {
		t.Fatal("ComposePlugin = true, want false (podman info carries no plugin list)")
	}
	if !info.Rootless {
		t.Fatal("Rootless = false, want true (podman-info.json declares host.security.rootless)")
	}
}

func TestDetectEngineFallsBackOnUnrecognizedShape(t *testing.T) {
	info, err := DetectEngine("docker", "/var/run/docker.sock", runnerReturning(readTestdata(t, "unrecognized-info.json"), nil))
	if err != nil {
		t.Fatalf("DetectEngine returned an error for an unrecognized (but parseable) info shape: %v", err)
	}
	if info.Engine != EngineDocker || info.ServerVersion != "unknown" {
		t.Fatalf("got %+v, want the docker/unknown fallback", info)
	}
}

func TestDetectEngineFallsBackOnInvalidJSON(t *testing.T) {
	info, err := DetectEngine("docker", "/var/run/docker.sock", runnerReturning([]byte("not json"), nil))
	if err != nil {
		t.Fatalf("DetectEngine returned an error for invalid JSON: %v", err)
	}
	if info.Engine != EngineDocker || info.ServerVersion != "unknown" {
		t.Fatalf("got %+v, want the docker/unknown fallback", info)
	}
}

func TestDetectEngineReturnsErrorOnExecFailure(t *testing.T) {
	execErr := errors.New("exec: \"docker\": executable file not found in $PATH")
	_, err := DetectEngine("docker", "/var/run/docker.sock", runnerReturning(nil, execErr))
	if err == nil {
		t.Fatal("DetectEngine should surface a genuine exec/I-O failure, not fall back silently")
	}
}

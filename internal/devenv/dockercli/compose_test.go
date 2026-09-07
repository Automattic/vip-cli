package dockercli

import (
	"errors"
	"testing"
)

// errNotFound is a sentinel the lookPath stubs below return for an absent binary.
var errNotFound = errors.New("executable not found")

func TestComposeInvocationPluginPreferred(t *testing.T) {
	inv := composeInvocation("docker", func(string) (string, error) { return "/x", nil }, func() bool { return true })
	if len(inv) != 2 || inv[0] != "docker" || inv[1] != "compose" {
		t.Fatalf("want [docker compose], got %v", inv)
	}
}

func TestComposeInvocationStandaloneFallback(t *testing.T) {
	inv := composeInvocation("docker", func(name string) (string, error) {
		if name == "docker-compose" {
			return "/usr/local/bin/docker-compose", nil
		}
		return "", errNotFound
	}, func() bool { return false })
	if len(inv) != 1 || inv[0] != "docker-compose" {
		t.Fatalf("want [docker-compose], got %v", inv)
	}
}

func TestComposeInvocationDefaultsToPlugin(t *testing.T) {
	inv := composeInvocation("docker", func(string) (string, error) { return "", errNotFound }, func() bool { return false })
	if len(inv) != 2 || inv[0] != "docker" || inv[1] != "compose" {
		t.Fatalf("want [docker compose] default, got %v", inv)
	}
}

func TestComposeRequirementAlwaysOKForDocker(t *testing.T) {
	result := ComposeRequirement(EngineInfo{Engine: EngineDocker}, func() (string, error) {
		t.Fatal("dockerComposeVersion should not be probed for the docker engine")
		return "", nil
	})
	if !result.OK {
		t.Fatalf("got %+v, want OK for docker regardless of compose probe", result)
	}
}

func TestComposeRequirementOKForPodmanWithDockerComposeV2(t *testing.T) {
	result := ComposeRequirement(EngineInfo{Engine: EnginePodman}, func() (string, error) {
		return "v2.29.7", nil
	})
	if !result.OK {
		t.Fatalf("got %+v, want OK when docker-compose reports v2", result)
	}
}

func TestComposeRequirementRefusesPodmanWithoutDockerComposeV2(t *testing.T) {
	result := ComposeRequirement(EngineInfo{Engine: EnginePodman}, func() (string, error) {
		return "", errNotFound
	})
	if result.OK {
		t.Fatal("want refusal when docker-compose v2 is absent")
	}
	if result.Remedy == "" {
		t.Fatal("refusal must carry a remedy the CLI can print")
	}
}

func TestComposeRequirementRefusesPodmanWithComposeV1(t *testing.T) {
	result := ComposeRequirement(EngineInfo{Engine: EnginePodman}, func() (string, error) {
		return "1.29.2", nil
	})
	if result.OK {
		t.Fatal("want refusal for a v1 docker-compose binary")
	}
}

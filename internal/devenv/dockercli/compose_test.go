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

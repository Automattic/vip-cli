package proxy

import (
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/dockercli"
)

func TestProxyRunArgs(t *testing.T) {
	args := proxyRunArgs(Ports{HTTP: 8080, HTTPS: 4433}, "vipdev.lndo.site", dockercli.EngineInfo{})
	joined := strings.Join(args, " ")

	for _, want := range []string{
		"run", "-d",
		"--name " + ProxyContainerName,
		"--network vip-dev-env",
		ProxyImage,
		"--providers.docker=true",
		"--providers.docker.network=vip-dev-env",
		"--entrypoints.http.address=:80",
		"--entrypoints.https.address=:443",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("run args missing %q:\n%s", want, joined)
		}
	}
	// host port bindings: Ports.HTTP -> container :80, Ports.HTTPS -> container :443
	if !strings.Contains(joined, "-p 127.0.0.1:8080:80") {
		t.Fatalf("missing http port binding: %s", joined)
	}
	if !strings.Contains(joined, "-p 127.0.0.1:4433:443") {
		t.Fatalf("missing https port binding: %s", joined)
	}
	// ephemeral host port for the Traefik API/dashboard
	if !strings.Contains(joined, "127.0.0.1::8080") {
		t.Fatalf("missing dashboard port binding: %s", joined)
	}
	if !strings.Contains(joined, "/var/run/docker.sock:/var/run/docker.sock") {
		t.Fatalf("missing docker.sock mount: %s", joined)
	}
	// wildcard SAN env for the domain
	if !strings.Contains(joined, "LANDO_EXTRA_NAMES=DNS.100 = *.vipdev.lndo.site") {
		t.Fatalf("missing wildcard extra-names env: %s", joined)
	}
}

func TestProxyBindAddressForDockerIsLoopback(t *testing.T) {
	if got := ProxyBindAddressFor(dockercli.EngineInfo{Engine: dockercli.EngineDocker}); got != "127.0.0.1" {
		t.Fatalf("got %q, want 127.0.0.1 for docker", got)
	}
}

func TestProxyBindAddressForUnknownEngineIsLoopback(t *testing.T) {
	if got := ProxyBindAddressFor(dockercli.EngineInfo{}); got != "127.0.0.1" {
		t.Fatalf("got %q, want 127.0.0.1 for an unspecified/unknown engine", got)
	}
}

func TestProxyBindAddressForPodmanIsWildcard(t *testing.T) {
	if got := ProxyBindAddressFor(dockercli.EngineInfo{Engine: dockercli.EnginePodman}); got != "0.0.0.0" {
		t.Fatalf("got %q, want 0.0.0.0 for podman", got)
	}
}

func TestProxySocketMountForDockerIsUnchanged(t *testing.T) {
	mount := ProxySocketMountFor(dockercli.EngineInfo{Engine: dockercli.EngineDocker})
	if mount.Source != "/var/run/docker.sock" || mount.Target != "/var/run/docker.sock" {
		t.Fatalf("got %+v, want the existing docker.sock mount unchanged", mount)
	}
	if mount.SecurityOptDisableLabel {
		t.Fatal("docker must never get the SELinux label=disable security-opt")
	}
}

func TestProxySocketMountForPodmanUsesRealSocketAndDisablesLabel(t *testing.T) {
	mount := ProxySocketMountFor(dockercli.EngineInfo{Engine: dockercli.EnginePodman, SocketPath: "/run/user/1000/podman/podman.sock"})
	if mount.Source != "/run/user/1000/podman/podman.sock" {
		t.Fatalf("got source %q, want the real podman socket path", mount.Source)
	}
	if mount.Target != "/var/run/docker.sock" {
		t.Fatalf("got target %q, want the container-side path unchanged", mount.Target)
	}
	if !mount.SecurityOptDisableLabel {
		t.Fatal("podman socket mount must set SecurityOptDisableLabel")
	}
}

func TestProxyRunArgsPublishesWildcardAndRealSocketUnderPodman(t *testing.T) {
	info := dockercli.EngineInfo{Engine: dockercli.EnginePodman, SocketPath: "/run/user/1000/podman/podman.sock"}
	joined := strings.Join(proxyRunArgs(Ports{HTTP: 80, HTTPS: 443}, "vipdev.lndo.site", info), " ")
	if !strings.Contains(joined, "-p 0.0.0.0:80:80") {
		t.Fatalf("missing wildcard http port binding: %s", joined)
	}
	if !strings.Contains(joined, "-p 0.0.0.0:443:443") {
		t.Fatalf("missing wildcard https port binding: %s", joined)
	}
	if !strings.Contains(joined, "/run/user/1000/podman/podman.sock:/var/run/docker.sock") {
		t.Fatalf("missing real podman socket mount: %s", joined)
	}
	if !strings.Contains(joined, "--security-opt label=disable") {
		t.Fatalf("missing SELinux label=disable security-opt: %s", joined)
	}
}

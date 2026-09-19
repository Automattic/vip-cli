package proxy

import (
	"strings"
	"testing"
)

func TestProxyRunArgs(t *testing.T) {
	args := proxyRunArgs(Ports{HTTP: 8080, HTTPS: 4433}, "vipdev.lndo.site")
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

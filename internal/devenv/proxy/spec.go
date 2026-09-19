package proxy

import (
	"fmt"

	"github.com/Automattic/vip/internal/devenv/compose"
)

// ProxyContainerName is the shared proxy container (parity: dev-environment-lando.ts:330).
const ProxyContainerName = "vip-dev-env-proxy"

// ProxyImage is the Traefik+openssl image (parity: lando-proxy builder.js).
const ProxyImage = "ghcr.io/automattic/vip-container-images/traefik_openssl:v3"

// ProxyConfigVolume holds the Traefik file-provider configs (per-env tls certs).
const ProxyConfigVolume = "proxy_config"

// proxyCommand is the Traefik arg list (parity: lando-proxy/index.js) plus the
// docker.network arg so Traefik resolves services on our single shared network.
var proxyCommand = []string{
	"--log.level=DEBUG",
	// API enabled (no auth) for health checks on the ephemeral :8080 bind; UI off.
	"--api.insecure=true",
	"--api.dashboard=false",
	"--providers.docker=true",
	"--providers.docker.network=" + compose.ProxyNetwork,
	"--providers.docker.exposedbydefault=false",
	"--entrypoints.https.address=:443",
	"--entrypoints.http.address=:80",
	"--providers.file.directory=/proxy_config",
	"--providers.file.watch=true",
}

// proxyRunArgs builds the `docker run` argv for the shared proxy. The cert
// volume + boot-script mounts are appended per Task 1 findings (see Task 7);
// this builder establishes the network, ports, socket mount, env, and command.
func proxyRunArgs(ports Ports, domain string) []string {
	args := []string{
		"run", "-d",
		"--name", ProxyContainerName,
		"--network", compose.ProxyNetwork,
		"--restart", "unless-stopped",
		"-p", fmt.Sprintf("%s:%d:80", ProxyBindAddress, ports.HTTP),
		"-p", fmt.Sprintf("%s:%d:443", ProxyBindAddress, ports.HTTPS),
		"-p", fmt.Sprintf("%s::8080", ProxyBindAddress),
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
		"-v", ProxyConfigVolume + ":/proxy_config",
		"-v", ProxyCertsVolume + ":/certs",
		// The four LANDO_* vars below are retained for Lando image parity but are
		// inert under the stock Traefik entrypoint: the image bundles none of
		// Lando's cert scripts that would consume them.
		"-e", "LANDO_APP_PROJECT=_lando_",
		"-e", fmt.Sprintf("LANDO_EXTRA_NAMES=DNS.100 = *.%s", domain),
		"-e", "LANDO_PROXY_CONFIG_FILE=/proxy_config/proxy.yaml",
		"-e", "LANDO_PROXY_PASSTHRU=true",
		ProxyImage,
	}
	args = append(args, proxyCommand...)
	return args
}

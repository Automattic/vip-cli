package proxy

import (
	"context"
	"errors"
	"fmt"
)

// EnsureOptions configures an Ensure call. Domain is used in Traefik env vars.
// free is an unexported probe so in-package tests can inject a stub; when nil,
// production falls back to ListenProbe.
type EnsureOptions struct {
	Domain string
	free   func(int) bool
}

// IsRunning reports whether the proxy container is currently running by
// inspecting it with `docker inspect`. Because DockerRunner only surfaces an
// error (no stdout), we treat "inspect succeeds" as "container exists and is
// running". A *stopped* orphan container also passes this check, so callers
// that want to replace a stopped proxy should invoke RemoveOrphan first.
func IsRunning(ctx context.Context, r DockerRunner) bool {
	err := r.Docker(ctx, "inspect", "-f", "{{.State.Running}}", ProxyContainerName)
	return err == nil
}

// Ensure starts the shared Traefik proxy if it is not already running,
// selecting free host ports and persisting them. On a Docker-level bind
// failure (TOCTOU race between ListenProbe and the actual bind) it cleans up
// the partial container and retries with the next HTTP candidate. HTTPS stays
// fixed at the first candidate that passed the probe — advancing both
// independently would require per-entrypoint error attribution from Docker
// stderr, which the error-only DockerRunner does not expose; this is a
// documented follow-up.
func Ensure(ctx context.Context, r DockerRunner, opts EnsureOptions) (Ports, error) {
	free := opts.free
	if free == nil {
		free = ListenProbe
	}

	if IsRunning(ctx, r) {
		// Already running — load whatever ports were persisted last time.
		// A missing state file yields zero Ports (no error); the caller treats
		// that as "ports unknown".
		ports, err := LoadPorts(PortsStatePath())
		return ports, err
	}

	if err := EnsureNetwork(ctx, r); err != nil {
		return Ports{}, err
	}

	// Choose HTTPS once; advance HTTP candidate on each bind failure.
	httpsPort, err := SelectPort(DefaultHTTPS, HTTPSFallbacks, free)
	if err != nil {
		return Ports{}, err
	}

	httpCandidates := append([]int{DefaultHTTP}, HTTPFallbacks...)

	var lastErr error
	for _, hp := range httpCandidates {
		if !free(hp) {
			continue
		}
		ports := Ports{HTTP: hp, HTTPS: httpsPort}
		if err := r.Docker(ctx, proxyRunArgs(ports, opts.Domain)...); err != nil {
			lastErr = err
			// Clean up the name-collision / partial container before retrying.
			_ = r.Docker(ctx, "rm", "-f", ProxyContainerName)
			continue
		}
		if err := SavePorts(PortsStatePath(), ports); err != nil {
			return Ports{}, err
		}
		return ports, nil
	}

	if lastErr != nil {
		return Ports{}, fmt.Errorf("proxy: could not start after trying http candidates: %w", lastErr)
	}
	return Ports{}, errors.New("proxy: no free http port among preferred + fallbacks")
}

// RemoveOrphan best-effort removes a *stopped* proxy container so a fresh one
// can bind (ports Node ensureNoOrphantProxyContainer). It uses `docker rm`
// WITHOUT -f: that removes a stopped container but errors on a running one,
// leaving a healthy proxy intact. All errors are intentionally ignored — the
// expected "cannot remove a running container" error is indistinguishable from
// a real daemon failure through the error-only runner, so we never surface it.
func RemoveOrphan(ctx context.Context, r DockerRunner) error {
	_ = r.Docker(ctx, "rm", ProxyContainerName)
	return nil
}

// ForceRemove force-removes the shared proxy container (running or stopped) so a
// subsequent Ensure rebuilds it from the correct image. Used by Lando adoption:
// Lando's proxy shares the vip-dev-env-proxy name, and IsRunning would otherwise
// treat it as ours and skip recreation.
func ForceRemove(ctx context.Context, r DockerRunner) error {
	return r.Docker(ctx, "rm", "-f", ProxyContainerName)
}

// Cleanup removes the proxy container and its proxy_config volume when no dev
// environment remains. All errors are ignored (best-effort). The caller
// decides when no environments remain.
func Cleanup(ctx context.Context, r DockerRunner) error {
	_ = r.Docker(ctx, "rm", "-f", ProxyContainerName)
	// ProxyCertsVolume (the CA + leaf certs) is intentionally NOT removed: the CA
	// survives teardown so the user need not re-trust it on the next create, which
	// would otherwise cost an admin privilege prompt.
	_ = r.Docker(ctx, "volume", "rm", ProxyConfigVolume)
	return nil
}

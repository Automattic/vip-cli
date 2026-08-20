package devenv

import (
	"context"
	"runtime"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/devenv/hostops"
	"github.com/Automattic/vip/internal/devenv/lifecycle"
	"github.com/Automattic/vip/internal/devenv/proxy"
	"github.com/Automattic/vip/internal/httpproxy"
)

// dockerAdapter satisfies lifecycle.Docker using the real *dockercli.Runner.
type dockerAdapter struct{ r *dockercli.Runner }

func (a dockerAdapter) Compose(ctx context.Context, project string, args ...string) error {
	return a.r.Compose(ctx, project, args...)
}
func (a dockerAdapter) ComposePS(ctx context.Context, project string) ([]lifecycle.ServiceState, error) {
	raw, err := a.r.ComposePS(ctx, project)
	if err != nil {
		return nil, err
	}
	out := make([]lifecycle.ServiceState, len(raw))
	for i, s := range raw {
		out[i] = lifecycle.ServiceState{Service: s.Service, State: s.State, ExitCode: s.ExitCode}
	}
	return out, nil
}
func (a dockerAdapter) ListVolumes(ctx context.Context) ([]string, error) {
	b, err := a.r.DockerOut(ctx, "volume", "ls", "--format", "{{.Name}}")
	if err != nil {
		return nil, err
	}
	return parseVolumeLines(b), nil
}

// parseVolumeLines splits `docker volume ls --format {{.Name}}` output into names,
// dropping the trailing newline and any blank lines.
func parseVolumeLines(b []byte) []string {
	var names []string
	for _, line := range strings.Split(strings.TrimRight(string(b), "\n"), "\n") {
		if line != "" {
			names = append(names, line)
		}
	}
	return names
}

func (a dockerAdapter) ListContainers(ctx context.Context, filters ...string) ([]lifecycle.Container, error) {
	args := []string{"ps", "-a", "--format", "{{.ID}}\t{{.Names}}"}
	for _, f := range filters {
		args = append(args, "--filter", f)
	}
	b, err := a.r.DockerOut(ctx, args...)
	if err != nil {
		return nil, err
	}
	return parseContainerLines(b), nil
}

// parseContainerLines splits `docker ps --format {{.ID}}\t{{.Names}}` output into
// Containers, dropping the trailing newline and any blank lines.
func parseContainerLines(b []byte) []lifecycle.Container {
	var out []lifecycle.Container
	for _, line := range strings.Split(strings.TrimRight(string(b), "\n"), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 2)
		c := lifecycle.Container{ID: parts[0]}
		if len(parts) > 1 {
			c.Name = parts[1]
		}
		out = append(out, c)
	}
	return out
}

// proxyAdapter binds the proxy package funcs to the lifecycle.Proxy interface,
// carrying the runner so each call uses the real DockerRunner.
type proxyAdapter struct{ r *dockercli.Runner }

func (a proxyAdapter) Ensure(ctx context.Context, o proxy.EnsureOptions) (proxy.Ports, error) {
	return proxy.Ensure(ctx, a.r, o)
}
func (a proxyAdapter) EnsureCA(ctx context.Context) error { return proxy.EnsureCA(ctx, a.r) }
func (a proxyAdapter) EnsureCert(ctx context.Context, req proxy.CertRequest) error {
	return proxy.EnsureCert(ctx, a.r, req)
}
func (a proxyAdapter) ExtractCA(ctx context.Context, dest string) (string, error) {
	return proxy.ExtractCA(ctx, a.r, dest)
}
func (a proxyAdapter) Cleanup(ctx context.Context) error      { return proxy.Cleanup(ctx, a.r) }
func (a proxyAdapter) RemoveOrphan(ctx context.Context) error { return proxy.RemoveOrphan(ctx, a.r) }
func (a proxyAdapter) ForceRemove(ctx context.Context) error  { return proxy.ForceRemove(ctx, a.r) }

// elevatorAdapter / httpProber are trivial real impls.
type elevatorAdapter struct{}

func (elevatorAdapter) Apply(plan hostops.PrivilegedPlan) error { return hostops.Apply(plan) }
func (elevatorAdapter) CATrusted(caPath string) bool {
	return hostops.CATrusted(runtime.GOOS, caPath)
}
func (elevatorAdapter) HostsPresent(hosts []string) bool { return hostops.HostsPresent(hosts) }

type httpProber struct{}

// Probe fetches the environment's own front-end URL, e.g.
// https://<slug>.vipdev.site/, which /etc/hosts maps to 127.0.0.1 on THIS
// machine. It must never be proxied: httpproxy.ProxyURL honours VIP_PROXY
// unconditionally and exempts no loopback (matching Node's proxy-from-env), so
// the policy client would hand this hostname to the developer's SOCKS proxy to
// resolve and dial on the proxy's side, where the containers do not exist. Node
// does not proxy it either — Lando's health check is internal, and the only
// dev-environment request Node routes through createProxyAgent is the WordPress
// version manifest (dev-environment-core.ts:1044).
func (httpProber) Probe(url string) (int, error) {
	c := httpproxy.DirectClientWithTimeout(5 * time.Second)
	resp, err := c.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

// subsiteAdapter lists multisite subsite domains via `wp site list` on the php
// container. Satisfies lifecycle.SubsiteLister.
type subsiteAdapter struct{ r *dockercli.Runner }

func (a subsiteAdapter) ListSubsiteDomains(ctx context.Context, project, service string) ([]string, error) {
	out, err := a.r.ComposeOut(ctx, project,
		"exec", "-T", "-u", "www-data", service,
		"wp", "--allow-root", "site", "list", "--fields=domain", "--format=csv")
	if err != nil {
		return nil, err
	}
	return parseSiteListCSV(out), nil
}

// parseSiteListCSV extracts the domain column from `wp site list --fields=domain
// --format=csv` output (a header line "domain" followed by one domain per line).
func parseSiteListCSV(out []byte) []string {
	var domains []string
	for _, ln := range strings.Split(string(out), "\n") {
		ln = strings.TrimSpace(strings.Trim(ln, "\r"))
		if ln == "" || ln == "domain" {
			continue
		}
		domains = append(domains, ln)
	}
	return domains
}

// realDeps assembles the production lifecycle.Deps around a runner.
func realDeps(r *dockercli.Runner) lifecycle.Deps {
	return lifecycle.Deps{
		Docker:   dockerAdapter{r: r},
		Proxy:    proxyAdapter{r: r},
		Elevator: elevatorAdapter{},
		Prober:   httpProber{},
		Subsites: subsiteAdapter{r: r},
	}
}

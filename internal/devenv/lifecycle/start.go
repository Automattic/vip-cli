package lifecycle

import (
	"context"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/hostops"
	"github.com/Automattic/vip/internal/devenv/proxy"
)

// StartParams are the resolved inputs Start needs (the root package builds these
// from instance-data + materialization).
type StartParams struct {
	Project      string
	View         compose.View
	CertSANs     []string
	HostsAdd     []string // hostnames for /etc/hosts; wildcards are filtered by Start before elevation.
	InitServices []string
	SetupSteps   []compose.SetupStep
	Pull         bool
	SkipRebuild  bool // omit --force-recreate (only start non-running services)
	GOOS         string
	PollEvery    time.Duration // 0 => default; tests pass tiny
}

// nonWildcard drops wildcard SANs — valid for TLS, invalid as /etc/hosts entries.
func nonWildcard(hosts []string) []string {
	var out []string
	for _, h := range hosts {
		if !strings.Contains(h, "*") {
			out = append(out, h)
		}
	}
	return out
}

// Start brings an environment up: ensure proxy + CA + per-env cert, extract the
// CA, compose up, wait for init services, run setup steps, then trust the CA +
// write /etc/hosts under ONE elevation (after setup, so wp_blogs is queryable
// for subdomain-multisite subsites). Returns the bound proxy ports.
func Start(ctx context.Context, deps Deps, p StartParams) (proxy.Ports, error) {
	ports, err := deps.Proxy.Ensure(ctx, proxy.EnsureOptions{Domain: p.View.Domain})
	if err != nil {
		return proxy.Ports{}, err
	}
	if err := deps.Proxy.EnsureCA(ctx); err != nil {
		return proxy.Ports{}, err
	}
	if err := deps.Proxy.EnsureCert(ctx, proxy.CertRequest{
		Basename:   p.Project,
		CommonName: p.View.SiteSlug + "." + p.View.Domain,
		SANs:       p.CertSANs,
	}); err != nil {
		return proxy.Ports{}, err
	}
	caPath, err := deps.Proxy.ExtractCA(ctx, proxy.CAHostPath())
	if err != nil {
		return proxy.Ports{}, err
	}

	// --force-recreate is required for correct re-starts. The wordpress init
	// one-shot rsyncs (--delete) into ./wordpress, which removes the nested
	// /wp/config|log|uploads mountpoint dirs created during the previous start.
	// Without --force-recreate, `up` re-runs that init but leaves the php/nginx
	// containers as-is, so their nested bind mounts break and the run_as_root
	// chown fails with "/wp/config: No such file or directory". Recreating all
	// containers re-establishes those mounts after the rsync (matches Lando,
	// which recreates app containers on each start). Named volumes (DB data,
	// etc.) persist across recreate, so no data is lost.
	upArgs := []string{"up", "-d", "--remove-orphans"}
	if !p.SkipRebuild {
		upArgs = append(upArgs, "--force-recreate")
	}
	if !p.Pull {
		upArgs = append(upArgs, "--pull", "never")
	}
	if err := deps.Docker.Compose(ctx, p.Project, upArgs...); err != nil {
		return proxy.Ports{}, err
	}
	if len(p.InitServices) > 0 {
		if err := WaitForInit(ctx, deps.Docker, p.Project, p.InitServices, p.PollEvery); err != nil {
			return proxy.Ports{}, err
		}
	}
	if err := RunSetupSteps(ctx, deps.Docker, p.Project, p.SetupSteps); err != nil {
		return proxy.Ports{}, err
	}

	// Hosts + CA trust happen ONCE here, after setup, so wp_blogs is queryable
	// for subdomain-multisite subsites. wp-cli setup talks to the DB directly and
	// needs no DNS, so nothing earlier needs the hosts entries.
	if err := applyHostsAndTrust(ctx, deps, p, caPath); err != nil {
		return proxy.Ports{}, err
	}
	return ports, nil
}

// applyHostsAndTrust computes the env's desired hostnames (fixed + discovered
// subdomain-multisite subsites) and, under a single elevation, trusts the CA
// and/or writes the managed hosts block — but only when something is missing.
func applyHostsAndTrust(ctx context.Context, deps Deps, p StartParams, caPath string) error {
	hosts := nonWildcard(p.HostsAdd)
	if p.View.MultisiteEnabled && p.View.MultisiteSubdomain && deps.Subsites != nil {
		domains, err := deps.Subsites.ListSubsiteDomains(ctx, p.Project, setupService)
		if err == nil {
			hosts = append(hosts, SubsiteHosts(domains, p.View)...)
		}
		// Non-fatal: offline subsite resolution is best-effort; the public
		// wildcard covers subsites online.
	}
	hosts = dedupHosts(hosts)

	// Only elevate (one sudo prompt) when something actually needs changing: the
	// CA isn't trusted yet, or the /etc/hosts entries are missing. A previously
	// trusted CA + present hosts => no prompt (the common re-start case), and we
	// stop re-adding duplicate CA entries to the keychain.
	needTrust := caPath != "" && !deps.Elevator.CATrusted(caPath)
	needHosts := len(hosts) > 0 && !deps.Elevator.HostsPresent(hosts)
	if !needTrust && !needHosts {
		return nil
	}
	plan := hostops.PrivilegedPlan{GOOS: p.GOOS}
	if needTrust {
		plan.CAPath = caPath
	}
	if needHosts {
		plan.HostsAdd = hosts
	}
	return deps.Elevator.Apply(plan)
}

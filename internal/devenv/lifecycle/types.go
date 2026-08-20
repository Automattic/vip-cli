// Package lifecycle orchestrates vip dev-env environments (start/stop/rebuild/
// destroy/purge/info/health) and one-time Lando migration (spec §6/§10). It is
// pure control-flow over injected interfaces (Deps) so the orchestration order
// is unit-testable with fakes; the root internal/devenv package supplies the
// real adapters.
package lifecycle

import (
	"context"

	"github.com/Automattic/vip/internal/devenv/hostops"
	"github.com/Automattic/vip/internal/devenv/proxy"
)

// ServiceState is one service's status from `docker compose ps`.
type ServiceState struct {
	Service  string
	State    string // "running", "exited", ...
	ExitCode int
}

// Container is the subset of `docker ps` a caller needs to identify a container.
type Container struct {
	ID   string
	Name string
}

// Docker is the compose/volume surface the lifecycle needs.
type Docker interface {
	Compose(ctx context.Context, project string, args ...string) error
	ComposePS(ctx context.Context, project string) ([]ServiceState, error)
	ListVolumes(ctx context.Context) ([]string, error)
	// ListContainers runs `docker ps -a` with the given raw `--filter` values
	// (e.g. "label=com.docker.compose.project=foo") and returns the matches.
	ListContainers(ctx context.Context, filters ...string) ([]Container, error)
}

// Proxy wraps the proxy package so lifecycle control-flow is fakeable.
type Proxy interface {
	Ensure(ctx context.Context, opts proxy.EnsureOptions) (proxy.Ports, error)
	EnsureCA(ctx context.Context) error
	EnsureCert(ctx context.Context, req proxy.CertRequest) error
	ExtractCA(ctx context.Context, dest string) (string, error)
	Cleanup(ctx context.Context) error
	RemoveOrphan(ctx context.Context) error
	// ForceRemove force-removes the shared proxy so Ensure rebuilds it (Lando
	// adoption: Lando's proxy shares our container name).
	ForceRemove(ctx context.Context) error
}

// Elevator runs the single privileged operation (trust CA + /etc/hosts) and
// exposes non-privileged "already done?" checks so Start can skip the sudo
// prompt when nothing needs changing.
type Elevator interface {
	Apply(plan hostops.PrivilegedPlan) error
	// CATrusted reports whether caPath's CA is already trusted by the system.
	CATrusted(caPath string) bool
	// HostsPresent reports whether the managed /etc/hosts block already lists
	// every hostname in hosts.
	HostsPresent(hosts []string) bool
}

// Prober performs an HTTP GET for health checks, returning the status code.
type Prober interface {
	Probe(url string) (int, error)
}

// SubsiteLister lists the domains of a multisite's subsites by querying the
// running env (e.g. `wp site list`). Used post-setup to add subdomain-multisite
// subsite hosts to the managed hosts block for offline resolution.
type SubsiteLister interface {
	ListSubsiteDomains(ctx context.Context, project, service string) ([]string, error)
}

// Deps bundles every injected dependency the lifecycle engine uses.
type Deps struct {
	Docker   Docker
	Proxy    Proxy
	Elevator Elevator
	// Prober is reserved for the health-watch flow (consumed by the command layer
	// via Healthy); the Start/Stop engine funcs don't read it yet.
	Prober Prober
	// Subsites discovers multisite subsite domains; nil disables discovery
	// (single-site/subdirectory envs never call it).
	Subsites SubsiteLister
}

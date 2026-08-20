package devenv

import (
	"context"
	"errors"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/version"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/devlog"
	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/devenv/hostops"
	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/devenv/lifecycle"
	"github.com/Automattic/vip/internal/devenv/paths"
	"github.com/Automattic/vip/internal/devenv/proxy"
	"github.com/Automattic/vip/internal/httpproxy"
)

// newRunner builds the production docker runner. DockerSocket() is called once
// (intentional DOCKER_HOST side effect — Plan 1 parity). When ctx carries a
// session logger (set by the cobra layer for create/start), the runner tees its
// docker output into that per-env log.
func newRunner(ctx context.Context) (*dockercli.Runner, error) {
	if _, err := dockercli.DockerSocket(); err != nil {
		return nil, err
	}
	return &dockercli.Runner{Log: devlog.FromContext(ctx)}, nil
}

func goos() string { return runtime.GOOS }

// logBanner assembles the diagnostic banner written to the head of a fresh
// per-invocation log (ports writeLogBanner, dev-environment-lando.ts).
func logBanner(ctx context.Context, r *dockercli.Runner) devlog.Banner {
	return devlog.Banner{
		Command: strings.Join(os.Args, " "),
		OS:      fmt.Sprintf("%s %s", runtime.GOOS, runtime.GOARCH),
		CLI:     version.Version,
		Runtime: "go",
		Docker:  r.Versions(ctx),
		RAMGB:   "unknown",
		CPUs:    strconv.Itoa(runtime.NumCPU()),
	}
}

// StartOptions tunes a start.
type StartOptions struct {
	// SkipRebuild only starts services that are not already running (omits the
	// compose --force-recreate), matching Node `start --skip-rebuild`.
	SkipRebuild bool
	// Lando, when non-nil and Detected, adopts a pre-existing Lando environment
	// for this slug before starting: its old containers/proxy are removed and its
	// data volume reused. Set by the cobra layer after PlanLandoMigration + a
	// confirmation prompt.
	Lando *lifecycle.MigrationPlan
}

// Create writes a new env and (when c.Start) starts it.
func Create(ctx context.Context, c CreateConfig) error {
	if err := writeNewEnv(c); err != nil {
		return err
	}
	if c.Start {
		return Start(ctx, c.Slug, StartOptions{})
	}
	return nil
}

// Start materializes + starts an existing env (detecting migration on first run).
func Start(ctx context.Context, slug string, opts StartOptions) error {
	r, err := newRunner(ctx)
	if err != nil {
		return err
	}
	return startStack(ctx, r, realDeps(r), slug, opts)
}

// PlanLandoMigration detects a pre-existing Lando footprint for slug so the cobra
// layer can prompt before an irreversible adoption. It builds a runner and
// delegates to lifecycle.DetectLandoMigration.
func PlanLandoMigration(ctx context.Context, slug string) (lifecycle.MigrationPlan, error) {
	r, err := newRunner(ctx)
	if err != nil {
		return lifecycle.MigrationPlan{}, err
	}
	return lifecycle.DetectLandoMigration(ctx, dockerAdapter{r: r}, slug)
}

// Rebuild downs (keeping volumes) + orphan-guards, then re-runs the start stack.
func Rebuild(ctx context.Context, slug string) error {
	r, err := newRunner(ctx)
	if err != nil {
		return err
	}
	deps := realDeps(r)
	if err := lifecycle.Rebuild(ctx, deps.Docker, deps.Proxy, slug); err != nil {
		return err
	}
	return startStack(ctx, r, deps, slug, StartOptions{})
}

// startStack reads instance-data, runs one-time migration detection, materializes
// the compose files, pull-gates images, and runs lifecycle.Start. Shared by Start
// and Rebuild.
func startStack(ctx context.Context, r *dockercli.Runner, deps lifecycle.Deps, slug string, opts StartOptions) error {
	// Write the diagnostic banner to the head of a fresh per-invocation log
	// (Node parity: writeLogBanner). No-op if the file already has content.
	if r.Log != nil {
		_ = r.Log.WriteBanner(logBanner(ctx, r))
	}
	d, err := instancedata.Read(slug)
	if err != nil {
		return err
	}
	view := compose.NewView(d, compose.Options{
		Domain:              d.Domain,
		Migrate:             len(d.ExternalVolumes) > 0,
		ExternalVolumeNames: d.ExternalVolumes,
	})
	if _, err := Materialize(slug, view); err != nil {
		return err
	}
	// One-time Lando adoption: after materialize (so `compose down` finds the
	// project's compose file) and before Start (so the Go proxy/containers come up
	// clean on the reused data volume).
	if opts.Lando != nil && opts.Lando.Detected {
		if err := lifecycle.AdoptLando(ctx, deps, slug, *opts.Lando); err != nil {
			return err
		}
		d.MigratedFromLando = time.Now().UTC().Format(time.RFC3339)
		if err := instancedata.Write(slug, d); err != nil {
			return err
		}
	}
	pull := lifecycle.ShouldPull(time.Now(), d.PullAfter, registryReachable())
	if pull {
		if err := r.Compose(ctx, slug, "pull"); err != nil {
			return err
		}
		now := time.Now().Unix()
		d.PullAfter = &now
		_ = instancedata.Write(slug, d) // best-effort: pull succeeded; a stale timestamp only re-pulls next time
	}
	_, err = lifecycle.Start(ctx, deps, lifecycle.StartParams{
		Project:      slug,
		View:         view,
		CertSANs:     compose.CertSANs(view),
		HostsAdd:     envHosts(view, nil),
		InitServices: initServices(view),
		SetupSteps:   adoptSetupSteps(compose.SetupSteps(view), opts.Lando != nil && opts.Lando.Detected),
		Pull:         pull,
		SkipRebuild:  opts.SkipRebuild,
		GOOS:         goos(),
	})
	return err
}

// Stop stops an env's containers.
func Stop(ctx context.Context, slug string) error {
	r, err := newRunner(ctx)
	if err != nil {
		return err
	}
	return lifecycle.Stop(ctx, dockerAdapter{r: r}, slug)
}

// StopAll stops every on-disk environment (Node `dev-env stop --all`).
func StopAll(ctx context.Context) error {
	return stopEachEnv(instancedata.AllNames(), func(slug string) error {
		return Stop(ctx, slug)
	})
}

// stopEachEnv / purgeEachEnv apply an operation to every environment, CONTINUING
// past a failure and reporting all of them at the end. Node wraps each iteration
// of `stop --all` (vip-dev-env-stop.js:72-100) and `purge`
// (vip-dev-env-purge.js:85-98) in its own try/catch: it prints the error, sets
// process.exitCode = 1 and moves on. Returning on the first error instead left
// the remaining environments running / half-purged.
func stopEachEnv(names []string, stop func(string) error) error {
	return eachEnv(names, stop)
}

func purgeEachEnv(names []string, destroy func(string) error) error {
	return eachEnv(names, destroy)
}

// purgeEnvStep is the per-environment body of Purge, split out from the Docker
// plumbing so its error handling is unit-testable.
//
// The removal error is PROPAGATED. Node does the removal inside
// destroyEnvironment with a bare `fs.promises.rm(instancePath, {recursive:
// true})` — no `force: true` (dev-environment-core.ts:381-382) — so a failure
// rejects and the purge bin sets `process.exitCode = 1`
// (vip-dev-env-purge.js:92-97). Dropping it left an environment on disk (still
// listed by `dev-env list`, still counted by instancedata.AllNames()) while
// purge exited 0. The single-environment Destroy path always propagated it.
func purgeEnvStep(destroy, removeFiles func(string) error, soft bool) func(string) error {
	return func(slug string) error {
		if err := destroy(slug); err != nil {
			return err
		}
		if soft {
			// A soft purge keeps the env's config files so it can be recreated.
			return nil
		}
		return removeFiles(slug)
	}
}

func eachEnv(names []string, fn func(string) error) error {
	var errs []error
	for _, name := range names {
		if err := fn(name); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", name, err))
		}
	}
	return errors.Join(errs...)
}

// Destroy tears down an env's containers/volumes. When soft is true the env's
// config files (and its /etc/hosts entry) are KEPT so it can be recreated (Node
// `--soft`); otherwise the env dir is removed and /etc/hosts is recomputed for
// the remaining envs.
func Destroy(ctx context.Context, slug string, soft bool) error {
	r, err := newRunner(ctx)
	if err != nil {
		return err
	}
	deps := realDeps(r)

	hadCustom := false
	if d, err := instancedata.Read(slug); err == nil {
		hadCustom = len(envHosts(compose.NewView(d, compose.Options{Domain: d.Domain}), nil)) > 0
	}

	// A soft destroy leaves the env on disk, so it still counts as remaining
	// (keeps the shared proxy alive for a later restart).
	remaining := len(instancedata.AllNames())
	if !soft {
		remaining--
	}
	if err := lifecycle.Destroy(ctx, deps.Docker, deps.Proxy, slug, remaining); err != nil {
		return err
	}
	if soft {
		return nil
	}
	if err := removeEnvFiles(slug); err != nil {
		return err
	}
	// Recompute the managed /etc/hosts block for the remaining envs — only when
	// the file was or will be affected, to avoid a needless sudo prompt.
	remain := remainingHosts()
	if hadCustom || len(remain) > 0 {
		plan := hostops.PrivilegedPlan{GOOS: goos()}
		if len(remain) > 0 {
			plan.HostsAdd = remain
		} else {
			plan.HostsRemove = true
		}
		return deps.Elevator.Apply(plan)
	}
	return nil
}

// Purge destroys every env, cleans up the shared proxy, and clears the managed
// /etc/hosts block (only when some env had custom-domain entries — avoids a
// needless sudo prompt).
func Purge(ctx context.Context, soft bool) error {
	r, err := newRunner(ctx)
	if err != nil {
		return err
	}
	deps := realDeps(r)
	hadCustom := len(remainingHosts()) > 0
	// Pass remaining=1 so lifecycle.Destroy never runs its per-env proxy cleanup
	// (which fires only at remaining==0). Purge owns a single Proxy.Cleanup below,
	// after every env is torn down.
	//
	// A failing environment must NOT abort the purge (Node continues and exits
	// 1); the shared proxy + hosts cleanup below still has to run, otherwise one
	// wedged environment leaves the machine half-purged.
	destroyErr := purgeEachEnv(instancedata.AllNames(), purgeEnvStep(
		func(slug string) error { return lifecycle.Destroy(ctx, deps.Docker, deps.Proxy, slug, 1) },
		removeEnvFiles,
		soft,
	))
	if err := deps.Proxy.Cleanup(ctx); err != nil {
		return errors.Join(destroyErr, err)
	}
	// A soft purge keeps every env's config files + /etc/hosts entries.
	if !soft && hadCustom {
		return errors.Join(destroyErr, deps.Elevator.Apply(hostops.PrivilegedPlan{GOOS: goos(), HostsRemove: true}))
	}
	return destroyErr
}

// Info returns a human-readable summary of an env (URL from bound ports + status).
func Info(ctx context.Context, slug string) (string, error) {
	r, err := newRunner(ctx)
	if err != nil {
		return "", err
	}
	d, err := instancedata.Read(slug)
	if err != nil {
		return "", err
	}
	view := compose.NewView(d, compose.Options{Domain: d.Domain})
	ports, _ := proxy.LoadPorts(proxy.PortsStatePath())
	states, _ := dockerAdapter{r: r}.ComposePS(ctx, slug)
	return renderEnvInfo(slug, view, ports, states), nil
}

// InfoAll returns the Info summary for every on-disk environment, separated by
// a blank line (Node `dev-env info --all`).
func InfoAll(ctx context.Context) (string, error) {
	names := instancedata.AllNames()
	if len(names) == 0 {
		return "No local environments found.\n", nil
	}
	var b strings.Builder
	for i, name := range names {
		if s, err := Info(ctx, name); err != nil {
			fmt.Fprintf(&b, "Environment: %s\n  error: %v\n", name, err)
		} else {
			b.WriteString(s)
		}
		if i < len(names)-1 {
			b.WriteString("\n")
		}
	}
	return b.String(), nil
}

// registryProbeURL is the registry the reachability check HEADs. A var so the
// proxy-policy test can point it at a local server.
var registryProbeURL = "https://ghcr.io/"

// registryReachable does a quick HEAD to ghcr.io to gate image pulls.
//
// ghcr.io is off-box, so it follows vip-next's proxy policy rather than
// http.DefaultTransport's: a developer behind the VIP SOCKS proxy has no other
// route out, and one who declined VIP_USE_SYSTEM_PROXY must not have the probe
// silently pushed through an ambient HTTPS_PROXY. See internal/httpproxy.
func registryReachable() bool {
	c := httpproxy.ClientWithTimeout(3 * time.Second)
	resp, err := c.Head(registryProbeURL)
	if err != nil {
		return false
	}
	_ = resp.Body.Close()
	return true
}

// viewForData builds the default render View for an env's instance data.
func viewForData(d *instancedata.InstanceData) compose.View {
	return compose.NewView(d, compose.Options{Domain: d.Domain})
}

// envHosts returns the hostnames an env needs in the managed hosts block: the
// front-end host plus the pma/mailpit hosts for enabled services, then any
// already-discovered multisite subsite hosts. Applies to ALL envs now (the
// managed block is the offline supplement; online the public wildcard covers it).
func envHosts(v compose.View, subsiteHosts []string) []string {
	hosts := []string{v.SiteSlug + "." + v.Domain}
	if v.PHPMyAdmin {
		hosts = append(hosts, v.SiteSlug+"-pma."+v.Domain)
	}
	if v.Mailpit {
		hosts = append(hosts, v.SiteSlug+"-mailpit."+v.Domain)
	}
	hosts = append(hosts, subsiteHosts...)
	return hosts
}

// remainingHosts is the union of fixed hosts across every env still on disk
// (used to recompute the hosts block after a destroy). Subsite hosts are not
// re-discovered here; they refresh on each env's next start.
func remainingHosts() []string {
	var all []string
	for _, name := range instancedata.AllNames() {
		d, err := instancedata.Read(name)
		if err != nil {
			continue
		}
		view := compose.NewView(d, compose.Options{Domain: d.Domain})
		all = append(all, envHosts(view, nil)...)
	}
	return all
}

// initServices lists the one-shot init services to wait for. Names are verified
// against compose/project.go: wordpress init = "wordpress", mu-plugins = "vip-mu-plugins",
// app-code = "demo-app-code".
func initServices(v compose.View) []string {
	svcs := []string{"wordpress"}
	if !v.MuPluginsLocal {
		svcs = append(svcs, "vip-mu-plugins")
	}
	if !v.AppCodeLocal {
		svcs = append(svcs, "demo-app-code")
	}
	return svcs
}

func removeEnvFiles(slug string) error {
	return os.RemoveAll(paths.EnvironmentPath(slug))
}

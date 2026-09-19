package devenv

import (
	"context"
	"fmt"
	"sort"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/devenv/hostops"
	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/devenv/lifecycle"
)

// HostRefreshDeps separates complete snapshot construction from Docker,
// instance-data, and privileged host-file boundaries.
type HostRefreshDeps struct {
	Names           func() []string
	Read            func(string) (*instancedata.InstanceData, error)
	Running         func(context.Context) (map[string]bool, error)
	ListSubsites    func(context.Context, string) ([]string, error)
	SnapshotMatches func([]string) bool
	Apply           func(hostops.PrivilegedPlan) error
	GOOS            string
}

func sortedUniqueHosts(hosts []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(hosts))
	for _, host := range hosts {
		if host == "" || seen[host] {
			continue
		}
		seen[host] = true
		out = append(out, host)
	}
	sort.Strings(out)
	return out
}

func refreshManagedHostsWith(ctx context.Context, deps HostRefreshDeps) error {
	if deps.Names == nil || deps.Read == nil || deps.Running == nil ||
		deps.ListSubsites == nil || deps.SnapshotMatches == nil || deps.Apply == nil {
		return fmt.Errorf("devenv: incomplete managed-host refresh dependencies")
	}
	names := append([]string(nil), deps.Names()...)
	sort.Strings(names)
	running, err := deps.Running(ctx)
	if err != nil {
		return fmt.Errorf("read environment running state: %w", err)
	}

	var hosts []string
	for _, name := range names {
		isRunning, known := running[name]
		if !known {
			return fmt.Errorf("running state is unavailable for local environment %q", name)
		}
		data, err := deps.Read(name)
		if err != nil {
			return fmt.Errorf("read local environment %q: %w", name, err)
		}
		view := compose.NewView(data, compose.Options{Domain: data.Domain})
		hosts = append(hosts, envHosts(view, nil)...)
		if !isRunning || !view.MultisiteEnabled || !view.MultisiteSubdomain {
			continue
		}
		domains, err := deps.ListSubsites(ctx, name)
		if err != nil {
			return fmt.Errorf("discover subsites for running environment %q: %w", name, err)
		}
		hosts = append(hosts, lifecycle.SubsiteHosts(domains, view)...)
	}
	hosts = sortedUniqueHosts(hosts)

	// No boundary call occurs before the complete snapshot exists. A failure
	// above therefore leaves the current global managed block untouched.
	if deps.SnapshotMatches(hosts) {
		return nil
	}
	plan := hostops.PrivilegedPlan{GOOS: deps.GOOS}
	if len(hosts) == 0 {
		plan.HostsRemove = true
	} else {
		plan.HostsAdd = hosts
	}
	return deps.Apply(plan)
}

func strictRunningMap(ctx context.Context, runner *dockercli.Runner, names []string) (map[string]bool, error) {
	docker := dockerAdapter{r: runner}
	out := make(map[string]bool, len(names))
	for _, name := range names {
		states, err := docker.ComposePS(ctx, name)
		if err != nil {
			return nil, err
		}
		out[name] = anyRunning(states)
	}
	return out, nil
}

// RefreshManagedHosts rebuilds the one globally-owned hosts block from every
// local environment. Subsites are discovered for every running subdomain
// multisite before any elevation occurs, so a single failed discovery can
// never erase another environment's offline names.
func RefreshManagedHosts(ctx context.Context) error {
	runner, err := newRunner(ctx)
	if err != nil {
		return err
	}
	names := instancedata.AllNames()
	subsites := subsiteAdapter{r: runner}
	return refreshManagedHostsWith(ctx, HostRefreshDeps{
		Names: func() []string { return names },
		Read:  instancedata.Read,
		Running: func(ctx context.Context) (map[string]bool, error) {
			return strictRunningMap(ctx, runner, names)
		},
		ListSubsites: func(ctx context.Context, name string) ([]string, error) {
			return subsites.ListSubsiteDomains(ctx, name, phpService)
		},
		SnapshotMatches: hostops.ManagedHostsMatch,
		Apply:           hostops.Apply,
		GOOS:            goos(),
	})
}

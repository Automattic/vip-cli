package lifecycle

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/hostops"
	"github.com/Automattic/vip/internal/devenv/proxy"
)

type recProxy struct{ events *[]string }

func (p recProxy) Ensure(ctx context.Context, o proxy.EnsureOptions) (proxy.Ports, error) {
	*p.events = append(*p.events, "proxy.Ensure")
	return proxy.Ports{HTTP: 80, HTTPS: 443}, nil
}
func (p recProxy) EnsureCA(ctx context.Context) error {
	*p.events = append(*p.events, "EnsureCA")
	return nil
}
func (p recProxy) EnsureCert(ctx context.Context, r proxy.CertRequest) error {
	*p.events = append(*p.events, "EnsureCert")
	return nil
}
func (p recProxy) ExtractCA(ctx context.Context, dest string) (string, error) {
	*p.events = append(*p.events, "ExtractCA")
	return dest, nil
}
func (p recProxy) Cleanup(ctx context.Context) error {
	*p.events = append(*p.events, "proxy.Cleanup")
	return nil
}
func (p recProxy) RemoveOrphan(ctx context.Context) error {
	*p.events = append(*p.events, "proxy.RemoveOrphan")
	return nil
}
func (p recProxy) ForceRemove(ctx context.Context) error {
	*p.events = append(*p.events, "proxy.ForceRemove")
	return nil
}

type recElevator struct {
	events *[]string
	last   hostops.PrivilegedPlan
	// caTrusted/hostsPresent drive the skip-elevation checks. Default false so
	// existing tests still see Elevator.Apply called.
	caTrusted    bool
	hostsPresent bool
	// lastPlan mirrors last for ordering tests; appliedBeforeSetup records
	// whether Apply ran before the Docker fake's setup exec (true => bug).
	lastPlan           hostops.PrivilegedPlan
	appliedBeforeSetup bool
	dk                 *recDocker // optional: lets Apply observe setup ordering
}

func (e *recElevator) Apply(plan hostops.PrivilegedPlan) error {
	*e.events = append(*e.events, "Elevator.Apply")
	e.last = plan
	e.lastPlan = plan
	if e.dk != nil {
		e.appliedBeforeSetup = !e.dk.setupDone
	}
	return nil
}

func (e *recElevator) CATrusted(string) bool      { return e.caTrusted }
func (e *recElevator) HostsPresent([]string) bool { return e.hostsPresent }

// recDocker records compose subcommands as "compose:<sub>".
type recDocker struct {
	events      *[]string
	ps          [][]ServiceState
	composeArgs [][]string
	// setupDone is set once RunSetupSteps' exec has run (a "compose exec").
	setupDone bool
}

func (d *recDocker) Compose(ctx context.Context, project string, args ...string) error {
	if len(args) > 0 {
		*d.events = append(*d.events, "compose:"+args[0])
		if args[0] == "exec" {
			d.setupDone = true
		}
	}
	d.composeArgs = append(d.composeArgs, append([]string{}, args...))
	return nil
}
func (d *recDocker) ComposePS(ctx context.Context, project string) ([]ServiceState, error) {
	if len(d.ps) == 0 {
		return nil, nil
	}
	out := d.ps[0]
	d.ps = d.ps[1:]
	return out, nil
}
func (d *recDocker) ListVolumes(ctx context.Context) ([]string, error) { return nil, nil }
func (d *recDocker) ListContainers(ctx context.Context, filters ...string) ([]Container, error) {
	return nil, nil
}

func assertOrder(t *testing.T, events []string, want ...string) {
	t.Helper()
	idx := 0
	for _, e := range events {
		if idx < len(want) && e == want[idx] {
			idx++
		}
	}
	if idx != len(want) {
		t.Fatalf("events %v did not contain ordered subsequence %v (matched %d)", events, want, idx)
	}
}

func TestStartOrdersOperations(t *testing.T) {
	var events []string
	d := &recDocker{events: &events, ps: [][]ServiceState{{{Service: "wordpress", State: "exited", ExitCode: 0}}}}
	el := &recElevator{events: &events}
	deps := Deps{
		Docker:   d,
		Proxy:    recProxy{events: &events},
		Elevator: el,
		Prober:   &fakeProber{codes: map[string]int{"https://example.vipdev.lndo.site/": 200}},
	}
	view := compose.View{SiteSlug: "example", Domain: "vipdev.lndo.site"}
	ports, err := Start(context.Background(), deps, StartParams{
		Project:      "example",
		View:         view,
		CertSANs:     []string{"example.vipdev.lndo.site", "*.vipdev.lndo.site"},
		HostsAdd:     []string{"mysite.test", "*.vipdev.lndo.site"},
		InitServices: []string{"wordpress"},
		SetupSteps:   []compose.SetupStep{{AsRoot: false, Command: "true"}},
		Pull:         false,
		PollEvery:    time.Millisecond,
	})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if ports.HTTPS != 443 {
		t.Fatalf("ports not returned: %+v", ports)
	}
	assertOrder(t, events,
		"proxy.Ensure", "EnsureCA", "EnsureCert", "ExtractCA",
		"compose:up", "compose:exec", "Elevator.Apply")
	if len(el.last.HostsAdd) != 1 || el.last.HostsAdd[0] != "mysite.test" {
		t.Fatalf("expected only the non-wildcard host in HostsAdd, got %v", el.last.HostsAdd)
	}
	for _, h := range el.last.HostsAdd {
		if strings.Contains(h, "*") {
			t.Fatalf("wildcard leaked into HostsAdd: %v", el.last.HostsAdd)
		}
	}
	// `up` must --force-recreate so the php/nginx nested mounts are rebuilt
	// after the wordpress init's rsync --delete (else re-starts break the chown).
	var sawForceRecreate bool
	for _, args := range d.composeArgs {
		if len(args) > 0 && args[0] == "up" {
			for _, a := range args {
				if a == "--force-recreate" {
					sawForceRecreate = true
				}
			}
		}
	}
	if !sawForceRecreate {
		t.Fatalf("compose up must include --force-recreate; got %v", d.composeArgs)
	}
}

func TestNonWildcard(t *testing.T) {
	cases := []struct {
		in   []string
		want []string
	}{
		{[]string{"*.example.com"}, nil},
		{[]string{"mysite.test", "*.example.com"}, []string{"mysite.test"}},
		{[]string{"a.test", "b.test"}, []string{"a.test", "b.test"}},
	}
	for i, c := range cases {
		got := nonWildcard(c.in)
		if len(got) != len(c.want) {
			t.Fatalf("case %d: got %v, want %v", i, got, c.want)
		}
		for j := range got {
			if got[j] != c.want[j] {
				t.Fatalf("case %d: got %v, want %v", i, got, c.want)
			}
		}
	}
}

// TestStartSkipsElevationWhenTrustedAndHostsPresent verifies the #1 fix: a
// re-start with the CA already trusted and hosts present does NOT elevate (no
// sudo prompt, no duplicate keychain entries).
func TestStartSkipsElevationWhenTrustedAndHostsPresent(t *testing.T) {
	var events []string
	d := &recDocker{events: &events, ps: [][]ServiceState{{{Service: "wordpress", State: "exited", ExitCode: 0}}}}
	el := &recElevator{events: &events, caTrusted: true, hostsPresent: true}
	deps := Deps{
		Docker:   d,
		Proxy:    recProxy{events: &events},
		Elevator: el,
		Prober:   &fakeProber{codes: map[string]int{"https://example.vipdev.lndo.site/": 200}},
	}
	if _, err := Start(context.Background(), deps, StartParams{
		Project:      "example",
		View:         compose.View{SiteSlug: "example", Domain: "vipdev.lndo.site"},
		CertSANs:     []string{"example.vipdev.lndo.site"},
		HostsAdd:     []string{"mysite.test"},
		InitServices: []string{"wordpress"},
		SetupSteps:   []compose.SetupStep{{AsRoot: false, Command: "true"}},
		PollEvery:    time.Millisecond,
	}); err != nil {
		t.Fatal(err)
	}
	for _, e := range events {
		if e == "Elevator.Apply" {
			t.Fatalf("Elevator.Apply must be skipped when CA trusted + hosts present; events=%v", events)
		}
	}
}

// TestStartElevatesHostsOnlyWhenTrusted verifies that when the CA is already
// trusted but hosts are missing, Start elevates for the hosts only and does NOT
// re-trust the CA (no CAPath in the plan).
func TestStartElevatesHostsOnlyWhenTrusted(t *testing.T) {
	var events []string
	d := &recDocker{events: &events, ps: [][]ServiceState{{{Service: "wordpress", State: "exited", ExitCode: 0}}}}
	el := &recElevator{events: &events, caTrusted: true, hostsPresent: false}
	deps := Deps{
		Docker:   d,
		Proxy:    recProxy{events: &events},
		Elevator: el,
		Prober:   &fakeProber{codes: map[string]int{"https://example.vipdev.lndo.site/": 200}},
	}
	if _, err := Start(context.Background(), deps, StartParams{
		Project:      "example",
		View:         compose.View{SiteSlug: "example", Domain: "vipdev.lndo.site"},
		CertSANs:     []string{"example.vipdev.lndo.site"},
		HostsAdd:     []string{"mysite.test"},
		InitServices: []string{"wordpress"},
		SetupSteps:   []compose.SetupStep{{AsRoot: false, Command: "true"}},
		PollEvery:    time.Millisecond,
	}); err != nil {
		t.Fatal(err)
	}
	if el.last.CAPath != "" {
		t.Fatalf("CA already trusted: must not re-trust, got CAPath=%q", el.last.CAPath)
	}
	if len(el.last.HostsAdd) != 1 || el.last.HostsAdd[0] != "mysite.test" {
		t.Fatalf("expected hosts-only elevation, got HostsAdd=%v", el.last.HostsAdd)
	}
}

type fakeSubsites struct {
	domains []string
	calls   int
}

func (f *fakeSubsites) ListSubsiteDomains(_ context.Context, _, _ string) ([]string, error) {
	f.calls++
	return f.domains, nil
}

func TestSubsiteListerSatisfied(t *testing.T) {
	var _ SubsiteLister = &fakeSubsites{}
}

func TestStartElevatesAfterSetupWithSubsites(t *testing.T) {
	var events []string
	dk := &recDocker{events: &events, ps: [][]ServiceState{{{Service: "wordpress", State: "exited", ExitCode: 0}}}}
	el := &recElevator{events: &events, dk: dk} // caTrusted/hostsPresent default false => Apply runs
	subs := &fakeSubsites{domains: []string{"s1.net.vipdev.site", "foreign.com"}}
	deps := Deps{Docker: dk, Proxy: recProxy{events: &events}, Elevator: el, Subsites: subs}
	view := compose.View{SiteSlug: "net", Domain: "vipdev.site", MultisiteEnabled: true, MultisiteSubdomain: true}
	_, err := Start(context.Background(), deps, StartParams{
		Project:    "net",
		View:       view,
		HostsAdd:   []string{"net.vipdev.site"},
		SetupSteps: []compose.SetupStep{{AsRoot: false, Command: "true"}},
		GOOS:       "darwin",
	})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if subs.calls != 1 {
		t.Fatalf("expected 1 subsite query, got %d", subs.calls)
	}
	got := map[string]bool{}
	for _, h := range el.lastPlan.HostsAdd {
		got[h] = true
	}
	if !got["net.vipdev.site"] || !got["s1.net.vipdev.site"] || got["foreign.com"] {
		t.Fatalf("Apply HostsAdd = %v; want fixed+subsite, no foreign", el.lastPlan.HostsAdd)
	}
	if el.appliedBeforeSetup {
		t.Fatal("elevation ran before setup; must run after")
	}
}

func TestStartSkipsSubsiteQueryForSingleSite(t *testing.T) {
	var events []string
	subs := &fakeSubsites{}
	deps := Deps{
		Docker:   &recDocker{events: &events, ps: [][]ServiceState{{{Service: "wordpress", State: "exited", ExitCode: 0}}}},
		Proxy:    recProxy{events: &events},
		Elevator: &recElevator{events: &events},
		Subsites: subs,
	}
	view := compose.View{SiteSlug: "solo", Domain: "vipdev.site"} // not multisite
	_, _ = Start(context.Background(), deps, StartParams{Project: "solo", View: view, HostsAdd: []string{"solo.vipdev.site"}, GOOS: "darwin"})
	if subs.calls != 0 {
		t.Fatalf("single-site must not query subsites, got %d calls", subs.calls)
	}
}

// TestStartSkipRebuildOmitsForceRecreate verifies --skip-rebuild drops
// --force-recreate (only start non-running services).
func TestStartSkipRebuildOmitsForceRecreate(t *testing.T) {
	var events []string
	d := &recDocker{events: &events, ps: [][]ServiceState{{{Service: "wordpress", State: "exited", ExitCode: 0}}}}
	deps := Deps{
		Docker:   d,
		Proxy:    recProxy{events: &events},
		Elevator: &recElevator{events: &events, caTrusted: true, hostsPresent: true},
		Prober:   &fakeProber{codes: map[string]int{"https://example.vipdev.lndo.site/": 200}},
	}
	if _, err := Start(context.Background(), deps, StartParams{
		Project:      "example",
		View:         compose.View{SiteSlug: "example", Domain: "vipdev.lndo.site"},
		CertSANs:     []string{"example.vipdev.lndo.site"},
		InitServices: []string{"wordpress"},
		SetupSteps:   []compose.SetupStep{{AsRoot: false, Command: "true"}},
		SkipRebuild:  true,
		PollEvery:    time.Millisecond,
	}); err != nil {
		t.Fatal(err)
	}
	for _, args := range d.composeArgs {
		if len(args) > 0 && args[0] == "up" {
			for _, a := range args {
				if a == "--force-recreate" {
					t.Fatalf("--skip-rebuild must omit --force-recreate; got %v", args)
				}
			}
		}
	}
}

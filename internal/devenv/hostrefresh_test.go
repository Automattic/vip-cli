package devenv

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/Automattic/vip/internal/devenv/hostops"
	"github.com/Automattic/vip/internal/devenv/instancedata"
)

type hostRefreshRecorder struct {
	data          map[string]*instancedata.InstanceData
	running       map[string]bool
	subsites      map[string][]string
	subsiteErr    map[string]error
	match         bool
	matchCalls    int
	applyCalls    int
	applied       hostops.PrivilegedPlan
	discoveryCall []string
}

func (r *hostRefreshRecorder) deps(names []string) HostRefreshDeps {
	return HostRefreshDeps{
		Names: func() []string { return names },
		Read: func(name string) (*instancedata.InstanceData, error) {
			data, ok := r.data[name]
			if !ok {
				return nil, errors.New("missing instance data")
			}
			return data, nil
		},
		Running: func(context.Context) (map[string]bool, error) {
			return r.running, nil
		},
		ListSubsites: func(_ context.Context, name string) ([]string, error) {
			r.discoveryCall = append(r.discoveryCall, name)
			return r.subsites[name], r.subsiteErr[name]
		},
		SnapshotMatches: func([]string) bool {
			r.matchCalls++
			return r.match
		},
		Apply: func(plan hostops.PrivilegedPlan) error {
			r.applyCalls++
			r.applied = plan
			return nil
		},
		GOOS: "darwin",
	}
}

func hostRefreshFixture() (*hostRefreshRecorder, []string) {
	recorder := &hostRefreshRecorder{
		data: map[string]*instancedata.InstanceData{
			"one": {
				SiteSlug: "one", Domain: "vipdev.site", PHPMyAdmin: true,
				Multisite: []byte(`"subdomain"`),
			},
			"two": {
				SiteSlug: "two", Domain: "vipdev.site", Mailpit: true,
				Multisite: []byte(`"subdomain"`),
			},
			"stopped": {
				SiteSlug: "stopped", Domain: "vipdev.site",
				Multisite: []byte(`"subdomain"`),
			},
		},
		running: map[string]bool{"one": true, "two": true, "stopped": false},
		subsites: map[string][]string{
			"one": {"sub.one.vipdev.site", "foreign.example.com"},
			"two": {"sub.two.vipdev.site", "deep.sub.two.vipdev.site"},
		},
		subsiteErr: map[string]error{},
	}
	return recorder, []string{"two", "stopped", "one"}
}

func TestRefreshManagedHostsBuildsCompleteSortedSnapshot(t *testing.T) {
	recorder, names := hostRefreshFixture()
	if err := refreshManagedHostsWith(context.Background(), recorder.deps(names)); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"one-pma.vipdev.site",
		"one.vipdev.site",
		"stopped.vipdev.site",
		"sub.one.vipdev.site",
		"sub.two.vipdev.site",
		"two-mailpit.vipdev.site",
		"two.vipdev.site",
	}
	if recorder.applyCalls != 1 || !reflect.DeepEqual(recorder.applied.HostsAdd, want) {
		t.Fatalf("apply calls=%d hosts=%#v, want %#v", recorder.applyCalls, recorder.applied.HostsAdd, want)
	}
	if got, wantCalls := recorder.discoveryCall, []string{"one", "two"}; !reflect.DeepEqual(got, wantCalls) {
		t.Fatalf("subsite discovery = %#v, want %#v", got, wantCalls)
	}
}

func TestRefreshManagedHostsLeavesCurrentBlockUntouchedOnDiscoveryFailure(t *testing.T) {
	recorder, names := hostRefreshFixture()
	recorder.subsiteErr["two"] = errors.New("wp site list failed")
	if err := refreshManagedHostsWith(context.Background(), recorder.deps(names)); err == nil {
		t.Fatal("expected discovery error")
	}
	if recorder.matchCalls != 0 || recorder.applyCalls != 0 {
		t.Fatalf("partial snapshot reached host file: match=%d apply=%d", recorder.matchCalls, recorder.applyCalls)
	}
}

func TestRefreshManagedHostsSkipsElevationForExactSnapshot(t *testing.T) {
	recorder, names := hostRefreshFixture()
	recorder.match = true
	if err := refreshManagedHostsWith(context.Background(), recorder.deps(names)); err != nil {
		t.Fatal(err)
	}
	if recorder.matchCalls != 1 || recorder.applyCalls != 0 {
		t.Fatalf("match=%d apply=%d", recorder.matchCalls, recorder.applyCalls)
	}
}

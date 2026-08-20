package proxy

import (
	"context"
	"strings"
	"testing"
)

func TestPortsStatePathUnderXDG(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/data")
	want := "/data/vip/dev-env/proxy-ports.json"
	if got := PortsStatePath(); got != want {
		t.Fatalf("PortsStatePath = %q, want %q", got, want)
	}
}

// fakeRunner records docker invocations and lets a test script their outcome.
type fakeRunner struct {
	calls   [][]string
	failSub string // if a docker arg list contains this, Docker returns err
}

func (f *fakeRunner) Docker(ctx context.Context, args ...string) error {
	f.calls = append(f.calls, args)
	if f.failSub != "" {
		for _, a := range args {
			if strings.Contains(a, f.failSub) {
				return errDocker
			}
		}
	}
	return nil
}

func TestEnsureNetworkCreatesWhenMissing(t *testing.T) {
	// network inspect fails (missing) -> network create is issued.
	r := &fakeRunner{failSub: "inspect"}
	if err := EnsureNetwork(context.Background(), r); err != nil {
		t.Fatalf("EnsureNetwork: %v", err)
	}
	var sawCreate bool
	for _, c := range r.calls {
		if len(c) >= 2 && c[0] == "network" && c[1] == "create" {
			sawCreate = true
		}
	}
	if !sawCreate {
		t.Fatalf("expected network create, calls=%v", r.calls)
	}
}

func TestEnsureNetworkNoopWhenPresent(t *testing.T) {
	r := &fakeRunner{} // inspect succeeds -> no create
	if err := EnsureNetwork(context.Background(), r); err != nil {
		t.Fatal(err)
	}
	for _, c := range r.calls {
		if len(c) >= 2 && c[0] == "network" && c[1] == "create" {
			t.Fatalf("should not create when network exists: %v", r.calls)
		}
	}
}

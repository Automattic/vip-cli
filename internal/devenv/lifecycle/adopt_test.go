package lifecycle

import (
	"context"
	"strings"
	"testing"
)

func TestAdoptLandoRemovesContainersKeepsVolumes(t *testing.T) {
	d := &fakeDocker{}
	events := []string{}
	deps := Deps{Docker: d, Proxy: recProxy{events: &events}}
	err := AdoptLando(context.Background(), deps, "example", MigrationPlan{Detected: true, LandoProxy: false})
	if err != nil {
		t.Fatal(err)
	}
	if len(d.calls) != 1 {
		t.Fatalf("want exactly one compose call, got %v", d.calls)
	}
	got := strings.Join(d.calls[0], " ")
	if !strings.Contains(got, "down --remove-orphans") {
		t.Fatalf("want `down --remove-orphans`, got %q", got)
	}
	if strings.Contains(got, "--volumes") || strings.Contains(got, " -v") {
		t.Fatalf("adoption must NOT delete volumes, got %q", got)
	}
	if strings.Contains(strings.Join(events, ","), "proxy.ForceRemove") {
		t.Fatal("proxy must not be force-removed when LandoProxy=false")
	}
}

func TestAdoptLandoRemovesProxyWhenLandoOwned(t *testing.T) {
	d := &fakeDocker{}
	events := []string{}
	deps := Deps{Docker: d, Proxy: recProxy{events: &events}}
	err := AdoptLando(context.Background(), deps, "example", MigrationPlan{Detected: true, LandoProxy: true})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(events, ","), "proxy.ForceRemove") {
		t.Fatalf("expected proxy.ForceRemove, events=%v", events)
	}
}

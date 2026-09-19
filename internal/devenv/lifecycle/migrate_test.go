package lifecycle

import (
	"context"
	"testing"
)

func TestDetectLandoMigrationDetectsThisSlugsContainers(t *testing.T) {
	d := &fakeDocker{containers: []fakeContainer{
		{id: "c1", name: "example_php_1", project: "example", lando: true},
		{id: "c2", name: "example_database_1", project: "example", lando: true},
	}}
	got, err := DetectLandoMigration(context.Background(), d, "example")
	if err != nil {
		t.Fatal(err)
	}
	if !got.Detected {
		t.Fatal("expected Detected=true")
	}
	if len(got.ContainerIDs) != 2 {
		t.Fatalf("want 2 container IDs, got %+v", got.ContainerIDs)
	}
}

// Regression guard for the hijack bug: detecting "myslug" must NEVER match
// another env's ("myapp") Lando containers.
func TestDetectLandoMigrationNeverAdoptsOtherEnv(t *testing.T) {
	d := &fakeDocker{containers: []fakeContainer{
		{id: "c1", name: "myapp_database_1", project: "myapp", lando: true},
	}}
	got, err := DetectLandoMigration(context.Background(), d, "myslug")
	if err != nil {
		t.Fatal(err)
	}
	if got.Detected {
		t.Fatalf("must not detect another env, got %+v", got)
	}
}

// A Go env's own containers share the project label but carry NO io.lando label,
// so they must never be treated as a Lando env.
func TestDetectLandoMigrationIgnoresGoContainers(t *testing.T) {
	d := &fakeDocker{containers: []fakeContainer{
		{id: "c1", name: "example_database_1", project: "example", lando: false},
	}}
	got, err := DetectLandoMigration(context.Background(), d, "example")
	if err != nil {
		t.Fatal(err)
	}
	if got.Detected {
		t.Fatalf("Go containers must not be detected, got %+v", got)
	}
}

func TestDetectLandoMigrationFlagsLandoProxy(t *testing.T) {
	d := &fakeDocker{containers: []fakeContainer{
		{id: "c1", name: "example_php_1", project: "example", lando: true},
		{id: "p", name: "vip-dev-env-proxy", project: "", lando: true},
	}}
	got, err := DetectLandoMigration(context.Background(), d, "example")
	if err != nil {
		t.Fatal(err)
	}
	if !got.LandoProxy {
		t.Fatal("expected LandoProxy=true")
	}
}

func TestDetectLandoMigrationNoneWhenNoContainers(t *testing.T) {
	d := &fakeDocker{}
	got, err := DetectLandoMigration(context.Background(), d, "example")
	if err != nil {
		t.Fatal(err)
	}
	if got.Detected {
		t.Fatalf("expected no detection, got %+v", got)
	}
}

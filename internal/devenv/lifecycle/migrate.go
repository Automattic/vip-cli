package lifecycle

import (
	"context"

	"github.com/Automattic/vip/internal/devenv/proxy"
)

// MigrationPlan describes a detected pre-existing Lando environment for a slug.
// A zero value (Detected=false) means the env is greenfield — no adoption needed.
type MigrationPlan struct {
	Detected     bool
	ContainerIDs []string
	LandoProxy   bool
}

// landoContainerLabel is Lando's own container marker; the Go stack never sets
// it, so it is the safe discriminator between a Lando env and a Go env that
// share the same compose-project label.
const landoContainerLabel = "label=io.lando.container=TRUE"

// DetectLandoMigration reports whether slug has a pre-existing Lando footprint
// to adopt. It is strictly scoped to this slug's compose project AND Lando-only
// labels, so it can never match another env's containers nor a Go env's own —
// the safety the disabled global volume scan lacked.
func DetectLandoMigration(ctx context.Context, d Docker, slug string) (MigrationPlan, error) {
	app, err := d.ListContainers(ctx, "label=com.docker.compose.project="+slug, landoContainerLabel)
	if err != nil {
		return MigrationPlan{}, err
	}
	if len(app) == 0 {
		return MigrationPlan{}, nil
	}
	plan := MigrationPlan{Detected: true}
	for _, c := range app {
		plan.ContainerIDs = append(plan.ContainerIDs, c.ID)
	}
	prox, err := d.ListContainers(ctx, "name="+proxy.ProxyContainerName, landoContainerLabel)
	if err != nil {
		return MigrationPlan{}, err
	}
	plan.LandoProxy = len(prox) > 0
	return plan, nil
}

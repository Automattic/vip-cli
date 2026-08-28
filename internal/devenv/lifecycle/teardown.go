package lifecycle

import "context"

// Stop stops the env's containers, keeping volumes + state.
func Stop(ctx context.Context, d Docker, project string) error {
	return d.Compose(ctx, project, "stop")
}

// Destroy removes the env's containers + its own (non-external) volumes via
// compose down -v. Migrated volumes are declared external, which compose refuses
// to delete, so original Lando data survives. When remaining == 0 (no other env
// left), the shared proxy is cleaned up too. The caller removes on-disk files +
// instance-data and recomputes /etc/hosts.
func Destroy(ctx context.Context, d Docker, pr Proxy, project string, remaining int) error {
	if err := d.Compose(ctx, project, "down", "--volumes", "--remove-orphans"); err != nil {
		return err
	}
	if remaining == 0 {
		return pr.Cleanup(ctx)
	}
	return nil
}

// Rebuild recreates containers keeping volumes: down (no -v) -> orphan guard.
// The caller re-runs the up + init-wait + setup sequence (via Start) afterward.
func Rebuild(ctx context.Context, d Docker, pr Proxy, project string) error {
	if err := d.Compose(ctx, project, "down", "--remove-orphans"); err != nil {
		return err
	}
	return pr.RemoveOrphan(ctx)
}

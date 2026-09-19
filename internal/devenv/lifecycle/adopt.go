package lifecycle

import (
	"context"
	"fmt"
)

// AdoptLando hands a pre-existing Lando environment to the Go engine. It removes
// Lando's old containers + the per-project network via `compose down
// --remove-orphans` (NO -v, so named data volumes are kept) and, when Lando owned
// the shared proxy, force-removes it so proxy.Ensure rebuilds the correct image.
// The natural same-name volume reuse (compose's `<slug>_database_data` equals the
// Lando volume) then preserves the data on the following start.
func AdoptLando(ctx context.Context, deps Deps, slug string, plan MigrationPlan) error {
	if err := deps.Docker.Compose(ctx, slug, "down", "--remove-orphans"); err != nil {
		return fmt.Errorf("removing old Lando containers for %q: %w", slug, err)
	}
	if plan.LandoProxy {
		if err := deps.Proxy.ForceRemove(ctx); err != nil {
			return fmt.Errorf("removing Lando proxy: %w", err)
		}
	}
	return nil
}

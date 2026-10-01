package devenv

import (
	"context"
	"fmt"
)

// Run the container-owned cleanup before WordPress can read imported credentials.
func sanitizeImportedCredentials(ctx context.Context, r importRunner, slug string) error {
	if err := r.Compose(ctx, slug, "exec", "-T", phpService, "php", "/dev-tools/import-cleanup.php"); err != nil {
		return fmt.Errorf("Database imported, but local connection credential cleanup failed: %w. Refresh the environment's WordPress image and retry the import.", err)
	}
	return nil
}

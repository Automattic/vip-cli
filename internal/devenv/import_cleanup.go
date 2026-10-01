package devenv

import (
	"context"
	_ "embed"
	"fmt"
	"strings"
)

// Keep this asset identical to assets/dev-env-import-cleanup.sql (Node).
//
//go:embed import_cleanup.sql
var importCredentialCleanupSQL string

//go:embed import_cache_flush.php
var importCacheFlushPHP string

// sanitizeImportedCredentials uses the database client directly: WordPress must
// not bootstrap with production credentials, even when Jetpack cannot load.
func sanitizeImportedCredentials(ctx context.Context, r importRunner, slug string) error {
	args := []string{"exec", "-T", phpService, "mysql", "-hdatabase", "-uwordpress", "-pwordpress", "-Dwordpress"}
	// A failed CALL can leave the temporary routine behind. Always remove it.
	defer func() {
		_ = r.ComposeStdin(ctx, slug, strings.NewReader("DROP PROCEDURE IF EXISTS vip_local_import_sanitize;\n"), args...)
	}()
	if err := r.ComposeStdin(ctx, slug, strings.NewReader(importCredentialCleanupSQL), args...); err != nil {
		return fmt.Errorf("Database imported, but local connection credential cleanup failed: %w", err)
	}
	// Database deletion alone leaves cached imported options visible to Jetpack.
	if err := r.Compose(ctx, slug, "exec", "-T", phpService, "php", "-r", strings.TrimPrefix(importCacheFlushPHP, "<?php\n")); err != nil {
		return fmt.Errorf("Database imported, but local connection credential cleanup failed: %w", err)
	}
	return nil
}

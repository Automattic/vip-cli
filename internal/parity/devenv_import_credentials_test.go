//go:build parity && import_cleanup_integration

package parity

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// The private import engine's opt-in bridge runs the actual Go sanitizer and
// built Node sanitizer against equivalent disposable database fixtures.
func TestDevEnvImportCredentialCleanupRealDatabase(t *testing.T) {
	if os.Getenv("VIP_IMPORT_CLEANUP_TEST_CONTAINER") == "" {
		t.Skip("requires disposable vip-import-cleanup-test-* MySQL/MariaDB container")
	}
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("go", "test", "-tags=parity,import_cleanup_integration", "-count=1", "./internal/devenv", "-run", "^TestImportCredentialCleanupRealRuntimeParity$", "-v")
	cmd.Dir = root
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("credential cleanup runtime parity: %v\n%s", err, output)
	}
	t.Logf("%s", output)
}

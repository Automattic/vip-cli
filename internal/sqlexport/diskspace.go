package sqlexport

import (
	"fmt"
	"path/filepath"

	"github.com/Automattic/vip/internal/devenv/paths"
)

// VipDataPath is the directory whose free space the storage check
// inspects (backup-storage-availability.ts:40: path.join(xdgData(), 'vip')).
func VipDataPath() string { return filepath.Join(paths.XDGData(), "vip") }

// ConfirmEnoughStorage ports
// validateAndPromptDiskSpaceWarningForBackupImport
// (backup-storage-availability.ts:84): when free space at the vip data
// path exceeds the archive size, continue silently; otherwise prompt.
// freeBytes and confirm are injected for tests; promptShown reports
// whether the user was asked (the command uses it to re-pad the
// progress frame, export-sql.ts:429-438).
func ConfirmEnoughStorage(archiveSize int64, freeBytes func() (int64, error), confirm func(message string) (bool, error)) (cont bool, promptShown bool, err error) {
	free, err := freeBytes()
	if err != nil {
		return false, false, err
	}
	if free > archiveSize {
		return true, false, nil
	}
	msg := fmt.Sprintf("We recommend that you have at least %s of free space in your machine to download this database backup. Do you still want to continue with downloading the database backup?",
		FormatMetricBytes(archiveSize))
	ok, err := confirm(msg)
	if err != nil {
		return false, true, err
	}
	return ok, true, nil
}

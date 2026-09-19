// Package mediaimport ports src/lib/media-import/** — the media-import
// status poller, its progress tracker, and the small helpers the three
// `vip import media*` commands share.
package mediaimport

import (
	"os"
	"strings"
)

// IsLocalArchive ports isLocalArchive (media-import/utils.ts:3):
// .tar.gz/.tgz/.zip (case-insensitive) AND an existing regular file.
func IsLocalArchive(filePath string) bool {
	lower := strings.ToLower(filePath)
	if !strings.HasSuffix(lower, ".tar.gz") && !strings.HasSuffix(lower, ".tgz") &&
		!strings.HasSuffix(lower, ".zip") {
		return false
	}
	fi, err := os.Stat(filePath)
	return err == nil && fi.Mode().IsRegular()
}

// IsSupportedApp ports isSupportedApp (media-file-import.ts:18):
// app.type must be in SUPPORTED_MEDIA_FILE_IMPORT_SITE_TYPES, i.e.
// exactly "WordPress".
func IsSupportedApp(appType string) bool { return appType == "WordPress" }

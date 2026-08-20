//go:build windows

package sqlexport

import (
	"os"

	"golang.org/x/sys/windows"
)

// FreeBytesAt reports the free disk space available to the current user
// at path.
func FreeBytesAt(path string) (int64, error) {
	if err := os.MkdirAll(path, 0o755); err != nil {
		return 0, err
	}
	var freeBytesAvailable, totalBytes, totalFreeBytes uint64
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0, err
	}
	if err := windows.GetDiskFreeSpaceEx(p, &freeBytesAvailable, &totalBytes, &totalFreeBytes); err != nil {
		return 0, err
	}
	return int64(freeBytesAvailable), nil // #nosec G115 -- disk sizes fit int64
}

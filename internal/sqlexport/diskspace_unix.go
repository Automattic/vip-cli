//go:build !windows

package sqlexport

import (
	"os"

	"golang.org/x/sys/unix"
)

// FreeBytesAt reports the free disk space available to the current user
// at path (the check-disk-space equivalent). The path is created if
// missing so Statfs has something to stat (the vip data dir may not
// exist on first run).
func FreeBytesAt(path string) (int64, error) {
	if err := os.MkdirAll(path, 0o755); err != nil {
		return 0, err
	}
	var st unix.Statfs_t
	if err := unix.Statfs(path, &st); err != nil {
		return 0, err
	}
	return int64(st.Bavail) * int64(st.Bsize), nil // #nosec G115 -- disk sizes fit int64
}

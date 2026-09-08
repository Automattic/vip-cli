package update

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
)

func AcquireLock(cli string) (func() error, error) {
	f, err := os.OpenFile(filepath.Join(filepath.Dir(cli), "."+filepath.Base(cli)+".update.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	var overlapped windows.Overlapped
	if err = windows.LockFileEx(windows.Handle(f.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &overlapped); err != nil {
		f.Close()
		return nil, fmt.Errorf("another update is running: %w", err)
	}
	return func() error { return f.Close() }, nil
}

//go:build darwin || linux

package update

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/unix"
)

func AcquireLock(cli string) (func() error, error) {
	f, err := os.OpenFile(filepath.Join(filepath.Dir(cli), "."+filepath.Base(cli)+".update.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = unix.Flock(int(f.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		f.Close()
		return nil, fmt.Errorf("another update is running: %w", err)
	}
	return func() error { return f.Close() }, nil
}

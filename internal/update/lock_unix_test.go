//go:build darwin || linux

package update

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/sys/unix"
)

func TestAcquireLockPreservesContentionError(t *testing.T) {
	cli := filepath.Join(t.TempDir(), "vip-next")
	release, err := AcquireLock(cli)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := release(); err != nil {
			t.Errorf("release lock: %v", err)
		}
	})
	for range 10 {
		unexpectedRelease, err := AcquireLock(cli)
		if unexpectedRelease != nil {
			_ = unexpectedRelease()
			t.Fatal("failed acquisition returned an unlock callback")
		}
		if !errors.Is(err, unix.EWOULDBLOCK) || !strings.Contains(err.Error(), "another update is running") {
			t.Fatalf("contention lost its message or native cause: %v", err)
		}
	}
}

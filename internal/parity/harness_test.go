//go:build parity

package parity

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func buildVipNextWithVersion(t *testing.T, ver, commit string) string {
	t.Helper()
	bin, err := buildVipNextInto(t.TempDir(), ver, commit)
	if err != nil {
		t.Fatal(err)
	}
	return bin
}

// buildVipNextInto is the *testing.T-free form, for the shared differential
// rig, whose binary has to outlive the test that happened to create it. It
// lives here because harness_test.go is the file allowed to reach for the
// ambient environment: `go build` is a toolchain call needing PATH, HOME and
// the build caches, not a CLI invocation whose environment is under test.
func buildVipNextInto(dir, ver, commit string) (string, error) {
	bin := filepath.Join(dir, "vip-next")
	cmd := exec.Command("go", "build",
		"-buildvcs=false",
		"-ldflags=-X github.com/Automattic/vip/internal/version.Version="+ver+
			" -X github.com/Automattic/vip/internal/version.Commit="+commit,
		"-o", bin,
		"../../cmd/vip-next")
	cmd.Env = os.Environ()
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("build vip-next: %w\n%s", err, stderr.String())
	}
	return bin, nil
}

func TestVersionSmokeSelfDiff(t *testing.T) {
	// Two builds with different version metadata.
	binA := buildVipNextWithVersion(t, "1.0.0", "aaaaaaa")
	binB := buildVipNextWithVersion(t, "9.9.9", "fffffff")

	s, err := LoadScenario("../../testdata/parity/version-smoke.yaml")
	if err != nil {
		t.Fatalf("LoadScenario: %v", err)
	}

	d, err := CompareBinaries(s, binA, binB)
	if err != nil {
		t.Fatalf("CompareBinaries: %v", err)
	}
	if !d.Equal {
		t.Errorf("self-diff after normalization should be Equal; got %+v", d)
	}
}

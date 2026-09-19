package update

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestNativeSelfReplacement(t *testing.T) {
	suffix := ""
	if runtime.GOOS == "windows" {
		suffix = ".exe"
	}
	root := t.TempDir()
	old := filepath.Join(root, "old"+suffix)
	newBin := filepath.Join(root, "new"+suffix)
	for path, v := range map[string]string{old: "old", newBin: "new"} {
		cmd := exec.Command("go", "build", "-buildvcs=false", "-ldflags=-X main.fixtureVersion="+v, "-o", path, "../../testdata/update-fixture")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("build fixture: %v\n%s", err, out)
		}
	}
	oldBytes, err := os.ReadFile(old)
	if err != nil {
		t.Fatal(err)
	}
	newBytes, err := os.ReadFile(newBin)
	if err != nil {
		t.Fatal(err)
	}
	for _, rollback := range []bool{false, true} {
		install, stage := t.TempDir(), t.TempDir()
		cli := filepath.Join(install, "vip-next"+suffix)
		helper := filepath.Join(install, "go-search-replace"+suffix)
		newCLI := filepath.Join(stage, "vip-next"+suffix)
		newHelper := filepath.Join(stage, "go-search-replace"+suffix)
		for path, data := range map[string][]byte{cli: oldBytes, helper: oldBytes, newCLI: newBytes, newHelper: newBytes} {
			if err := os.WriteFile(path, data, 0755); err != nil {
				t.Fatal(err)
			}
		}
		mode := "apply"
		if rollback {
			mode = "rollback"
		}
		cmd := exec.Command(cli, mode, stage, newCLI, newHelper)
		out, err := cmd.CombinedOutput()
		if rollback && err == nil || !rollback && err != nil {
			t.Fatalf("rollback=%v: %v\n%s", rollback, err, out)
		}
		want, version := newBytes, "new"
		if rollback {
			want, version = oldBytes, "old"
		}
		for _, path := range []string{cli, helper} {
			data, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(data, want) {
				t.Fatal("installed bytes differ", path, err)
			}
			out, err := exec.Command(path, "--version").CombinedOutput()
			if err != nil || strings.TrimSpace(string(out)) != version {
				t.Fatal("installed executable does not run", path, err, string(out))
			}
		}
	}
}

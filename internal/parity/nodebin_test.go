//go:build parity

package parity

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// nodeProbeFor builds a probe whose PATH lookup succeeds for "node" only when
// nodeOnPath is true. The filesystem is the real one, rooted at dir.
func nodeProbeFor(nodeOnPath bool) NodeVipBinProbe {
	return NodeVipBinProbe{
		Stat: os.Stat,
		LookPath: func(name string) (string, error) {
			if nodeOnPath && name == "node" {
				return "/usr/bin/node", nil
			}
			return "", errors.New("not found")
		},
	}
}

// nodeCLILayout materialises a fake built Node CLI: <root>/dist/bin/vip.js
// plus, optionally, <root>/node_modules.
func nodeCLILayout(t *testing.T, withBin, withModules bool) string {
	t.Helper()
	root := t.TempDir()
	if withBin {
		binDir := filepath.Join(root, "dist", "bin")
		if err := os.MkdirAll(binDir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(binDir, "vip.js"), []byte("#!/usr/bin/env node\n"), 0o755); err != nil { // #nosec G306
			t.Fatalf("write vip.js: %v", err)
		}
	}
	if withModules {
		if err := os.MkdirAll(filepath.Join(root, "node_modules"), 0o755); err != nil {
			t.Fatalf("mkdir node_modules: %v", err)
		}
	}
	return filepath.Join(root, "dist", "bin", "vip.js")
}

func TestResolveNodeVipBinReadyWhenEverythingPresent(t *testing.T) {
	path := nodeCLILayout(t, true, true)

	got := ResolveNodeVipBin(path, nodeProbeFor(true))

	if !got.Ready {
		t.Fatalf("Ready = false, want true (reason: %s)", got.Reason)
	}
	if got.Path != path {
		t.Errorf("Path = %q, want %q", got.Path, path)
	}
	if got.Reason != "" {
		t.Errorf("Reason = %q, want empty when ready", got.Reason)
	}
}

func TestResolveNodeVipBinUnsetNamesTheVariable(t *testing.T) {
	got := ResolveNodeVipBin("", nodeProbeFor(true))

	if got.Ready {
		t.Fatal("Ready = true, want false when NODE_VIP_BIN is unset")
	}
	if !strings.Contains(got.Reason, "NODE_VIP_BIN") {
		t.Errorf("Reason = %q, want it to name NODE_VIP_BIN", got.Reason)
	}
}

func TestResolveNodeVipBinMissingBuildNamesPathAndBuildCommand(t *testing.T) {
	path := nodeCLILayout(t, false, true)

	got := ResolveNodeVipBin(path, nodeProbeFor(true))

	if got.Ready {
		t.Fatal("Ready = true, want false when the Node CLI is not built")
	}
	if !strings.Contains(got.Reason, path) {
		t.Errorf("Reason = %q, want it to name the missing path %q", got.Reason, path)
	}
	if !strings.Contains(got.Reason, "npm run build") {
		t.Errorf("Reason = %q, want it to name `npm run build`", got.Reason)
	}
}

func TestResolveNodeVipBinMissingNodeModulesNamesNpmCi(t *testing.T) {
	path := nodeCLILayout(t, true, false)

	got := ResolveNodeVipBin(path, nodeProbeFor(true))

	if got.Ready {
		t.Fatal("Ready = true, want false when node_modules is absent")
	}
	if !strings.Contains(got.Reason, "node_modules") {
		t.Errorf("Reason = %q, want it to name node_modules", got.Reason)
	}
	if !strings.Contains(got.Reason, "npm ci") {
		t.Errorf("Reason = %q, want it to name `npm ci`", got.Reason)
	}
}

func TestResolveNodeVipBinMissingNodeInterpreter(t *testing.T) {
	path := nodeCLILayout(t, true, true)

	got := ResolveNodeVipBin(path, nodeProbeFor(false))

	if got.Ready {
		t.Fatal("Ready = true, want false when node is not on PATH")
	}
	if !strings.Contains(got.Reason, "node") {
		t.Errorf("Reason = %q, want it to name the missing node interpreter", got.Reason)
	}
}

// TestResolveNodeVipBinRejectsDirectories guards against NODE_VIP_BIN pointing
// at dist/bin instead of dist/bin/vip.js.
func TestResolveNodeVipBinRejectsDirectories(t *testing.T) {
	path := nodeCLILayout(t, true, true)
	dir := filepath.Dir(path)

	got := ResolveNodeVipBin(dir, nodeProbeFor(true))

	if got.Ready {
		t.Fatal("Ready = true, want false when NODE_VIP_BIN is a directory")
	}
	if !strings.Contains(got.Reason, "not a file") {
		t.Errorf("Reason = %q, want it to say the path is not a file", got.Reason)
	}
}

// TestNodeVipBinIsWiredForThisCheckout is the honesty check for the whole
// milestone: `make test-parity-unit` sets NODE_VIP_BIN, and in a checkout that
// has actually run `npm ci && npm run build` the Node-vs-Go scenario must RUN,
// not skip. When it cannot run, this test says loudly what is missing rather
// than reporting a silent pass.
func TestNodeVipBinIsWiredForThisCheckout(t *testing.T) {
	status := ResolveNodeVipBin(os.Getenv("NODE_VIP_BIN"), DefaultNodeVipBinProbe())
	if status.Ready {
		return
	}
	t.Skip(LoudSkip("Node-vs-Go differential coverage is OFF", status.Reason))
}

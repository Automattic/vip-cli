//go:build parity

package parity

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// NodeVipBinProbe abstracts the two host lookups needed to decide whether the
// Node CLI can actually be executed, so the decision is unit-testable without
// mutating PATH or the working tree.
type NodeVipBinProbe struct {
	Stat     func(string) (os.FileInfo, error)
	LookPath func(string) (string, error)
}

// DefaultNodeVipBinProbe queries the real filesystem and PATH.
func DefaultNodeVipBinProbe() NodeVipBinProbe {
	return NodeVipBinProbe{Stat: os.Stat, LookPath: exec.LookPath}
}

// NodeVipBinStatus is the verdict on a candidate Node CLI entrypoint.
// Reason is empty when Ready; otherwise it names precisely what is missing
// and the command that fixes it.
type NodeVipBinStatus struct {
	Path   string
	Ready  bool
	Reason string
}

// ResolveNodeVipBin decides whether the Node CLI at path can be run as the
// reference implementation in a differential scenario.
//
// It deliberately reports a REASON rather than a bare boolean: a developer who
// has not run `npm ci` must not be hard-failed, but neither may the suite
// silently report a pass while the only Node-vs-Go comparison in the repo
// quietly does nothing.
func ResolveNodeVipBin(path string, probe NodeVipBinProbe) NodeVipBinStatus {
	if probe.Stat == nil {
		probe.Stat = os.Stat
	}
	if probe.LookPath == nil {
		probe.LookPath = exec.LookPath
	}

	path = strings.TrimSpace(path)
	if path == "" {
		return NodeVipBinStatus{Reason: "NODE_VIP_BIN is not set. " +
			"Run the suite through `make test-parity-unit`, which points it at ./dist/bin/vip.js."}
	}

	info, err := probe.Stat(path)
	if err != nil {
		return NodeVipBinStatus{Path: path, Reason: fmt.Sprintf(
			"the Node CLI is not built: NODE_VIP_BIN=%s does not exist. "+
				"Build it with `npm ci && npm run build` from the repo root.", path)}
	}
	if info.IsDir() {
		return NodeVipBinStatus{Path: path, Reason: fmt.Sprintf(
			"NODE_VIP_BIN=%s is not a file. It must point at the CLI entrypoint "+
				"(dist/bin/vip.js), not at a directory.", path)}
	}

	if _, err := probe.LookPath("node"); err != nil {
		return NodeVipBinStatus{Path: path, Reason: fmt.Sprintf(
			"the `node` interpreter was not found on PATH, so NODE_VIP_BIN=%s cannot be executed. "+
				"Install Node 20+ (see package.json engines).", path)}
	}

	if !hasNodeModules(path, probe.Stat) {
		return NodeVipBinStatus{Path: path, Reason: fmt.Sprintf(
			"node_modules is missing above NODE_VIP_BIN=%s, so the Node CLI cannot load its "+
				"runtime dependencies. Run `npm ci` from the repo root.", path)}
	}

	return NodeVipBinStatus{Path: path, Ready: true}
}

// hasNodeModules walks up from the entrypoint looking for the installed
// dependency tree (dist/bin/vip.js -> dist/bin -> dist -> <root>/node_modules).
func hasNodeModules(binPath string, stat func(string) (os.FileInfo, error)) bool {
	dir := filepath.Dir(binPath)
	for {
		if info, err := stat(filepath.Join(dir, "node_modules")); err == nil && info.IsDir() {
			return true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return false
		}
		dir = parent
	}
}

// LoudSkip renders a skip banner and returns the one-line reason for t.Skip.
//
// `go test` buffers a passing package's output, so neither this banner nor the
// t.Skip body reaches the terminal without -v. The `test-parity-unit` Make
// target therefore prints its OWN banner before running the suite (it performs
// the same three checks in shell). This function is what makes the reason
// visible under `go test -v` and in CI logs that keep verbose output.
//
// Silence is the failure mode this slice exists to remove: a skipped
// differential test must never look like a passing one.
func LoudSkip(headline, reason string) string {
	banner := strings.Join([]string{
		"",
		"================================================================================",
		"  SKIPPED: " + headline,
		"  " + reason,
		"================================================================================",
		"",
	}, "\n")
	fmt.Fprint(os.Stderr, banner)
	return headline + ": " + reason
}

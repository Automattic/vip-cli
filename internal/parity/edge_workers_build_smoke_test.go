//go:build parity && edgeworkers_build_smoke

package parity

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Opt-in only: downloads the pinned SDK/compiler into owned temporary projects.
func TestEdgeWorkersRealCompilerSmoke(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("Edge Workers real compiler smoke", skip))
	}
	api := newEdgeFixtureAPI("empty")
	rig.serve(t, api)
	env := FixtureEnv(rig.scenarioEnv(&Scenario{Env: map[string]string{"NO_COLOR": "1", "VIP_NON_INTERACTIVE": "1"}}))
	roots := []string{edgeFixtureProject(t, "empty"), edgeFixtureProject(t, "empty")}
	trees := make([]map[string]string, 2)
	artifacts := make([][]byte, 2)
	run := func(bin, dir string, args ...string) {
		t.Helper()
		result, err := Run(RunSpec{Binary: bin, Dir: dir, Argv: args, Env: env})
		if err != nil {
			t.Fatal(err)
		}
		if result.ExitCode != 0 {
			t.Fatalf("%s %v: %s\n%s", bin, args, result.Stdout, result.Stderr)
		}
	}
	for i, bin := range []string{rig.nodeBin, rig.goBin} {
		run(bin, roots[i], "edge-workers", "init", ".")
		run(bin, roots[i], "edge-workers", "new", "headers")
		trees[i] = edgeTree(t, roots[i])
		if i == 0 {
			run("npm", roots[i], "install", "--no-audit", "--no-fund")
		} else {
			lock, err := os.ReadFile(filepath.Join(roots[0], "package-lock.json"))
			if err != nil {
				t.Fatal(err)
			}
			edgeWrite(t, roots[i], "package-lock.json", lock, 0644)
			run("npm", roots[i], "ci", "--no-audit", "--no-fund")
		}
		run(bin, roots[i], "edge-workers", "build", "headers")
		file := filepath.Join(roots[i], "build/headers.wasm")
		artifact, err := os.ReadFile(file)
		if err != nil || len(artifact) == 0 {
			t.Fatalf("artifact %v", err)
		}
		artifacts[i] = artifact
		run("node", roots[i], "-e", `const fs=require('node:fs');const m=new WebAssembly.Module(fs.readFileSync(process.argv[1]));const names=WebAssembly.Module.exports(m).filter(x=>x.kind==='function').map(x=>x.name).sort();if(JSON.stringify(names)!==JSON.stringify(['alloc','on_client_response']))throw Error('Unexpected exports: '+JSON.stringify(names));`, file)
		t.Logf("runtime %d compiled %d bytes with only alloc/on_client_response exports", i, len(artifact))
	}
	if !reflect.DeepEqual(trees[0], trees[1]) {
		t.Fatal("real scaffold files differ")
	}
	if !bytes.Equal(artifacts[0], artifacts[1]) {
		t.Fatal("real compiler artifacts differ")
	}
	ops, requests := api.snapshot()
	if len(ops) != 0 || len(requests) != 0 {
		t.Fatalf("local build issued API requests: %v", ops)
	}
}

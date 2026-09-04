package edgeworkers

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestScaffoldDoesNotOverwriteOrInstall(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "edge workers")
	if err := ScaffoldProject(dir, "assemblyscript"); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(filepath.Join(dir, "package.json"))
	if !strings.Contains(string(before), `"0.4.0"`) || !strings.Contains(string(before), `"0.27.0"`) {
		t.Fatalf("dependencies: %s", before)
	}
	if err := ScaffoldProject(dir, "assemblyscript"); err == nil {
		t.Fatal("overwrote project")
	}
	after, _ := os.ReadFile(filepath.Join(dir, "package.json"))
	if string(before) != string(after) {
		t.Fatal("changed existing files")
	}
	if _, err := os.Stat(filepath.Join(dir, "node_modules")); !os.IsNotExist(err) {
		t.Fatalf("installed: %v", err)
	}
	loc := &Location{Operator: "starts_with", Value: "/api/"}
	if err := ScaffoldWorker(dir, "headers", loc); err != nil {
		t.Fatal(err)
	}
	w, err := FindWorker(dir, "headers")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(w.Manifest.Location, LocationValue{Present: true, Value: loc}) {
		t.Fatalf("manifest: %#v", w.Manifest)
	}
	source, err := ReadWorkerSource(w)
	if err != nil || !strings.Contains(source, "export { alloc, on_client_response }") {
		t.Fatalf("source %q %v", source, err)
	}
	if err := ScaffoldWorker(dir, "headers", nil); err == nil {
		t.Fatal("overwrote worker")
	}
	if err := ScaffoldWorker(dir, "../escape", nil); err == nil {
		t.Fatal("accepted traversal")
	}
	if err := ScaffoldWorker(dir, "bad", &Location{Operator: "bad", Value: "/"}); err == nil {
		t.Fatal("accepted location")
	}
	if pathExists(filepath.Join(dir, WorkersDir, "bad")) {
		t.Fatal("partial scaffold")
	}
	target := filepath.Join(t.TempDir(), "linked")
	if err := os.Symlink(t.TempDir(), target); err != nil {
		t.Fatal(err)
	}
	if err := ScaffoldProject(target, "assemblyscript"); err == nil {
		t.Fatal("followed symlink")
	}
}

func TestCompilerArgumentsAndArtifacts(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "project with spaces & punctuation")
	if err := ScaffoldProject(dir, "assemblyscript"); err != nil {
		t.Fatal(err)
	}
	if err := ScaffoldWorker(dir, "headers", nil); err != nil {
		t.Fatal(err)
	}
	w, _ := FindWorker(dir, "headers")
	if _, err := (Compiler{}).Build(context.Background(), dir, w); err == nil || !strings.Contains(err.Error(), "npm install") {
		t.Fatalf("missing asc: %v", err)
	}
	writeTestFile(t, dir, "node_modules/.bin/asc", "")
	writeTestFile(t, dir, "node_modules/json-as/package.json", "{}")
	t.Setenv("NODE_OPTIONS", "--inspect")
	t.Setenv("EDGE_BUILD_TEST", "retained")
	var seen CompilerRequest
	compiler := Compiler{Run: func(_ context.Context, req CompilerRequest) (CompilerResult, error) {
		seen = req
		return CompilerResult{}, os.WriteFile(req.Args[6], []byte{0, 97, 115, 109}, 0600)
	}}
	art, err := compiler.Build(context.Background(), dir, w)
	if err != nil {
		t.Fatal(err)
	}
	entry, _ := filepath.EvalSymlinks(filepath.Join(w.Dir, w.Manifest.Entry))
	want := []string{entry, "--runtime", "stub", "--path", filepath.Join(dir, "node_modules"), "--outFile", art.Path, "--optimizeLevel", "3", "--shrinkLevel", "2", "--transform", "json-as/transform"}
	if !reflect.DeepEqual(seen.Args, want) || seen.Dir != dir || seen.Binary != filepath.Join(dir, "node_modules/.bin/asc") {
		t.Fatalf("request: %#v", seen)
	}
	for _, s := range seen.Env {
		if strings.HasPrefix(s, "NODE_OPTIONS=") {
			t.Fatal("inherited NODE_OPTIONS")
		}
	}
	if !strings.Contains(strings.Join(seen.Env, "\n"), "EDGE_BUILD_TEST=retained") {
		t.Fatal("lost environment")
	}
	if art.Base64 != "AGFzbQ==" || art.SizeBytes != 4 {
		t.Fatalf("artifact: %#v", art)
	}
	pre, err := ReadPrebuilt(dir, w)
	if err != nil || pre != art {
		t.Fatalf("prebuilt %#v %v", pre, err)
	}
	for _, tc := range []struct {
		result CompilerResult
		err    error
		want   string
	}{
		{CompilerResult{ExitCode: 1, Stdout: "out", Stderr: " err "}, nil, "Compilation failed for worker \"headers\":\nerr"},
		{CompilerResult{ExitCode: 1}, nil, "Compilation failed for worker \"headers\"."},
		{CompilerResult{}, errors.New("launch"), "Failed to run the AssemblyScript compiler: launch"},
	} {
		compiler.Run = func(context.Context, CompilerRequest) (CompilerResult, error) { return tc.result, tc.err }
		_, err := compiler.Build(context.Background(), dir, w)
		if err == nil || err.Error() != tc.want {
			t.Fatalf("error %v want %s", err, tc.want)
		}
	}
}

func TestSourceAndPrebuiltSafety(t *testing.T) {
	dir := t.TempDir()
	w := LocalWorker{Dir: dir, Manifest: Manifest{Name: "test", Entry: "entry.ts"}}
	if _, err := ReadPrebuilt(dir, w); err == nil {
		t.Fatal("accepted missing artifact")
	}
	if _, err := ReadWorkerSource(w); err == nil {
		t.Fatal("accepted missing source")
	}
	writeTestFile(t, dir, "entry.ts", "")
	src, err := ReadWorkerSource(w)
	if err != nil || src != "" {
		t.Fatalf("empty source %q %v", src, err)
	}
	outside := writeTestFile(t, t.TempDir(), "outside.wasm", "sentinel")
	if err := os.Mkdir(filepath.Join(dir, BuildDir), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, BuildDir, "test.wasm")); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadPrebuilt(dir, w); err == nil || !strings.Contains(err.Error(), "symbolic link") {
		t.Fatalf("artifact escape %v", err)
	}
}

func TestSourceUTF8ReplacementMatchesNode(t *testing.T) {
	dir := t.TempDir()
	w := LocalWorker{Dir: dir, Manifest: Manifest{Entry: "source.ts"}}
	for _, tc := range []struct {
		data []byte
		want string
	}{
		{[]byte{0xff, 0xff}, "\ufffd\ufffd"},
		{[]byte{0xe1, 0x80}, "\ufffd"},
		{[]byte{0xe1, 0x80, 0xff}, "\ufffd\ufffd"},
	} {
		if err := os.WriteFile(filepath.Join(dir, "source.ts"), tc.data, 0600); err != nil {
			t.Fatal(err)
		}
		got, err := ReadWorkerSource(w)
		if err != nil || got != tc.want {
			t.Fatalf("source %x => %q want %q (%v)", tc.data, got, tc.want, err)
		}
	}
}

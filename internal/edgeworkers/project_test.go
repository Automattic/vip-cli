package edgeworkers

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func writeTestFile(t *testing.T, root, name, body string) string {
	t.Helper()
	file := filepath.Join(root, name)
	if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(body), 0644); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestManifestPresenceAndValidation(t *testing.T) {
	dir := t.TempDir()
	for _, tc := range []struct {
		body    string
		present bool
		wantErr string
	}{
		{`{"name":"headers","entry":"assembly/index.ts"}`, false, ""},
		{`{"name":"headers","entry":"assembly/index.ts","location":null}`, true, ""},
		{`{"name":"headers","entry":"assembly/index.ts","location":{"operator":"equals","value":"/api/"}}`, true, ""},
		{`{"name":"headers","entry":"../escape"}`, false, "must stay within"},
		{`{"name":"headers","entry":"/escape"}`, false, "relative path"},
		{`{"name":"headers","entry":"index.ts","location":{"operator":"equals","value":"\n"}}`, false, "invalid location value"},
		{`{"name":"headers","entry":"index.ts","on_failure":null}`, false, "invalid \"on_failure\""},
		{`{"name":"headers"}`, false, "missing an \"entry\""},
		{`{"entry":"index.ts"}`, false, `Invalid worker name "undefined"`},
		{`[]`, false, "must be an object"},
		{`null`, false, "must be an object"},
		{`{`, false, "not valid JSON"},
	} {
		writeTestFile(t, dir, "worker.json", tc.body)
		m, err := ReadManifest(dir)
		if tc.wantErr != "" {
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("%s: %v", tc.body, err)
			}
			continue
		}
		if err != nil || m.Location.Present != tc.present {
			t.Fatalf("%s: %#v %v", tc.body, m, err)
		}
	}
}

func TestWorkerNamesAndLocationOptions(t *testing.T) {
	for _, name := range []string{"", ".", "..", "a/b", "a\\b", "CON", "lpt1.txt", "tail.", "tail ", "a\n", strings.Repeat("a", 65), strings.Repeat("😀", 33)} {
		if err := ValidateWorkerName(name, "worker name"); err == nil {
			t.Errorf("accepted %q", name)
		}
	}
	for _, name := range []string{"headers", "café", "console", "COM10", strings.Repeat("😀", 32)} {
		if err := ValidateWorkerName(name, "worker name"); err != nil {
			t.Error(err)
		}
	}
	for _, raw := range []string{"", "equals:", "bad:/api", "equals:/api\n"} {
		if _, err := ParseLocationOption(raw); err == nil {
			t.Errorf("accepted location %q", raw)
		}
	}
	for _, op := range []string{"contains", "equals", "starts_with", "ends_with"} {
		got, err := ParseLocationOption(op + ":/a:b")
		if err != nil || got.Operator != op || got.Value != "/a:b" {
			t.Fatalf("location: %#v %v", got, err)
		}
	}
}

func TestProjectDiscoveryAndResolution(t *testing.T) {
	root := t.TempDir()
	project := filepath.Join(root, "edge-workers")
	writeTestFile(t, project, "edge-workers.json", `{"type":"assemblyscript","sdk":"sdk"}`)
	for dir, name := range map[string]string{"z-folder": "zebra", "a-folder": "Alpha", "b-folder": "beta"} {
		writeTestFile(t, project, "workers/"+dir+"/worker.json", `{"name":"`+name+`","entry":"index.ts"}`)
	}
	for _, cwd := range []string{root, project, filepath.Join(project, "workers/a-folder")} {
		got, err := ResolveProjectDir(cwd, nil)
		if err != nil || got != project {
			t.Fatalf("resolve %s: %s %v", cwd, got, err)
		}
	}
	workers, err := DiscoverWorkers(project)
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, w := range workers {
		names = append(names, w.Manifest.Name)
	}
	if !reflect.DeepEqual(names, []string{"Alpha", "beta", "zebra"}) {
		t.Fatalf("order: %v", names)
	}
	for _, name := range []string{"Alpha", "a-folder"} {
		w, err := FindWorker(project, name)
		if err != nil || w.Manifest.Name != "Alpha" {
			t.Fatalf("find: %#v %v", w, err)
		}
	}
	writeTestFile(t, project, "workers/duplicate/worker.json", `{"name":"ALPHA","entry":"index.ts"}`)
	if _, err := DiscoverWorkers(project); err == nil || !strings.Contains(err.Error(), "Duplicate worker name") {
		t.Fatalf("duplicate: %v", err)
	}
	empty := ""
	if _, err := ResolveProjectDir(root, &empty); err == nil {
		t.Fatal("accepted empty path")
	}
	missing := filepath.Join(root, "missing")
	if _, err := ResolveProjectDir(project, &missing); err == nil {
		t.Fatal("ignored explicit missing project")
	}
}

func TestProjectDescriptorValidation(t *testing.T) {
	root := t.TempDir()
	for _, body := range []string{`{}`, `null`, `[]`, `{"type":null}`, `{"type":"rust"}`, `{"type":"assemblyscript","sdk":false}`} {
		writeTestFile(t, root, "edge-workers.json", body)
		if _, err := ReadProjectDescriptor(root); err == nil {
			t.Fatalf("accepted %s", body)
		}
	}
	writeTestFile(t, root, "edge-workers.json", `{"type":"assemblyscript","extra":true}`)
	if descriptor, err := ReadProjectDescriptor(root); err != nil || descriptor.Type != "assemblyscript" {
		t.Fatalf("%#v %v", descriptor, err)
	}
}

func TestProjectSymlinksAndContainment(t *testing.T) {
	root, outside := t.TempDir(), t.TempDir()
	writeTestFile(t, outside, "worker.json", `{"name":"external","entry":"index.ts"}`)
	if err := os.Symlink(filepath.Join(outside, "worker.json"), filepath.Join(root, "worker.json")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if _, err := ReadManifest(root); err == nil || !strings.Contains(err.Error(), "symbolic link") {
		t.Fatalf("manifest link: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "build")); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolveOutputPathWithin(root, "build/worker.wasm", "artifact", "build dir"); err == nil {
		t.Fatal("accepted symlink output parent")
	}
	if _, err := ResolveExistingPathWithin(root, "build/worker.json", "entry"); err == nil {
		t.Fatal("accepted entry escape")
	}
	if _, err := os.Stat(filepath.Join(outside, "worker.wasm")); !os.IsNotExist(err) {
		t.Fatal("wrote outside project")
	}
	if _, err := ResolvePathWithin(root, "../outside", "entry"); err == nil {
		t.Fatal("accepted traversal")
	}
	got, err := ResolveOutputPathWithin(root, "safe/nested/file.wasm", "artifact", "build dir")
	if err != nil || !strings.HasSuffix(got, "safe/nested/file.wasm") {
		t.Fatalf("safe output: %s %v", got, err)
	}
}

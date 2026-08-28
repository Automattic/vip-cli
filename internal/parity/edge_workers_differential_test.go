//go:build parity

package parity

import (
	"encoding/base64"
	json "encoding/json/v2"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/parser"
)

type edgeWorkerCase struct {
	Fixture, State    string
	WantPersistentOps []string
	WantExit          int
}
type edgeRequest struct {
	Operation string         `json:"operationName"`
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables"`
}
type edgeObservation struct {
	Operation string
	Variables map[string]any
	Source    bool
	Fields    []string
}

// Compare selected fields across generated fragments and Node's inline query.
// Ignore only Apollo's __typename bookkeeping, never source or input values.
func edgeSelectedFields(query string) ([]string, error) {
	doc, err := parser.ParseQuery(&ast.Source{Input: query})
	if err != nil {
		return nil, err
	}
	fields := []string{}
	var walk func(ast.SelectionSet, string)
	walk = func(selections ast.SelectionSet, prefix string) {
		for _, selection := range selections {
			switch s := selection.(type) {
			case *ast.Field:
				if s.Name == "__typename" {
					continue
				}
				path := prefix + s.Name
				fields = append(fields, path)
				walk(s.SelectionSet, path+".")
			case *ast.FragmentSpread:
				if fragment := doc.Fragments.ForName(s.Name); fragment != nil {
					walk(fragment.SelectionSet, prefix)
				}
			case *ast.InlineFragment:
				walk(s.SelectionSet, prefix)
			}
		}
	}
	for _, operation := range doc.Operations {
		walk(operation.SelectionSet, "")
	}
	sort.Strings(fields)
	return fields, nil
}

type edgeFixtureAPI struct {
	mu          sync.Mutex
	ops         []string
	requests    []edgeObservation
	workers     []map[string]any
	validations int
	state       string
}

func edgeRemoteWorker(name string, active bool) map[string]any {
	return map[string]any{"id": 9, "name": name, "active": active, "location": map[string]any{"operator": "contains", "value": "/old"}, "phases": []string{"client_response"}, "onFailure": "continue", "createdAt": "2026-08-28T00:00:00.000Z", "updatedAt": "2026-08-28T01:00:00.000Z", "source": "// stored source\n"}
}
func newEdgeFixtureAPI(state string) *edgeFixtureAPI {
	a := &edgeFixtureAPI{state: state, ops: []string{}, requests: []edgeObservation{}, workers: []map[string]any{}}
	switch state {
	case "inactive", "active", "empty-source", "no-source", "formatted-source", "null-mutation", "false-delete", "graphql-error", "control-name":
		w := edgeRemoteWorker("headers", state == "active")
		if state == "formatted-source" {
			w["source"] = "// café\nexport function run(): void {\r\n\t// controls: \x1b[2J\x00\b\r\x7f\u0085\u009b31m\n}\n// literal: \\u000a\n"
		}
		if state == "empty-source" {
			w["source"] = ""
		}
		if state == "no-source" {
			w["source"] = nil
		}
		if state == "control-name" {
			w["name"] = "headers\x1b\n\u009b"
		}
		a.workers = append(a.workers, w)
	}
	return a
}
func (a *edgeFixtureAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	var req edgeRequest
	if err := json.UnmarshalRead(r.Body, &req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	reply := func(data any) { _ = json.MarshalWrite(w, map[string]any{"data": data}) }
	fail := func(message string) {
		_ = json.MarshalWrite(w, map[string]any{"errors": []map[string]any{{"message": message}}})
	}
	if req.Operation == "App" || req.Operation == "ResolveAppByID" || req.Operation == "ResolveAppByName" {
		envs := []map[string]any{{"id": 7, "appId": 7, "name": "develop", "type": "develop", "primaryDomain": nil}, {"id": 8, "appId": 8, "name": "production", "type": "production", "primaryDomain": nil}}
		reply(map[string]any{"app": map[string]any{"id": 42, "name": "example-app", "environments": envs}})
		return
	}
	operation := req.Operation
	if operation == "EdgeWorkerDetailWithSource" {
		operation = "EdgeWorkerDetail"
	}
	fields, err := edgeSelectedFields(req.Query)
	if err != nil {
		fail("invalid GraphQL query")
		return
	}
	source := false
	for _, field := range fields {
		if field == "app.environments.edgeWorkers.source" {
			source = true
		}
	}
	a.requests = append(a.requests, edgeObservation{operation, req.Variables, source, fields})
	switch operation {
	case "EdgeWorkers", "EdgeWorkerDetail":
		if a.state == "null-read" {
			reply(nil)
			return
		}
		// Source/binary are never needed for list or reconciliation.
		if strings.Contains(req.Query, "wasmBinary") {
			fail("unexpected binary selection")
			return
		}
		if operation == "EdgeWorkers" && source {
			fail("unexpected source selection")
			return
		}
		reply(map[string]any{"app": map[string]any{"environments": []map[string]any{{"id": req.Variables["envId"], "edgeWorkers": a.workers}}}})
	case "ValidateEdgeWorker":
		a.validations++
		if a.state == "null-validation" {
			reply(map[string]any{"validateEdgeWorker": nil})
			return
		}
		valid := a.state != "invalid-validation" && !(a.state == "invalid-second" && a.validations == 2)
		errs := []string{}
		if !valid {
			errs = []string{"bad wasm"}
		}
		reply(map[string]any{"validateEdgeWorker": map[string]any{"valid": valid, "phases": []string{"client_response"}, "errors": errs}})
	case "CreateEdgeWorker", "UpdateEdgeWorker", "SetEdgeWorkerActive", "DeleteEdgeWorker":
		input, _ := req.Variables["input"].(map[string]any)
		name, _ := input["name"].(string)
		if name == "" && len(a.workers) > 0 {
			name, _ = a.workers[len(a.workers)-1]["name"].(string)
		}
		kind := map[string]string{"CreateEdgeWorker": "create", "UpdateEdgeWorker": "update", "DeleteEdgeWorker": "delete", "SetEdgeWorkerActive": "enable"}[operation]
		if operation == "SetEdgeWorkerActive" && input["active"] == false {
			kind = "disable"
		}
		a.ops = append(a.ops, kind+":"+name)
		field := strings.ToLower(operation[:1]) + operation[1:]
		if a.state == "null-mutation" {
			reply(map[string]any{field: nil})
			return
		}
		if a.state == "graphql-error" || a.state == "upload-second-fails" && name == "b" || a.state == "enable-fails" && kind == "enable" {
			fail("fixture rejected request")
			return
		}
		if kind == "delete" {
			reply(map[string]any{field: a.state != "false-delete"})
			return
		}
		worker := edgeRemoteWorker(name, false)
		if operation != "CreateEdgeWorker" && len(a.workers) > 0 {
			worker = a.workers[len(a.workers)-1]
		}
		if operation == "CreateEdgeWorker" {
			worker["location"] = nil
		}
		for _, key := range []string{"name", "location", "source", "onFailure", "active"} {
			if value, ok := input[key]; ok {
				worker[key] = value
			}
		}
		a.workers = append(a.workers, worker)
		reply(map[string]any{field: worker})
	default:
		fail("unexpected operation: " + req.Operation)
	}
}
func (a *edgeFixtureAPI) snapshot() ([]string, []edgeObservation) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]string{}, a.ops...), append([]edgeObservation{}, a.requests...)
}

func edgeWrite(t *testing.T, dir, name string, data []byte, mode fs.FileMode) {
	t.Helper()
	file := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, data, mode); err != nil {
		t.Fatal(err)
	}
}
func edgeFixtureProject(t *testing.T, fixture string) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if fixture == "empty" {
		return dir
	}
	base := "basic"
	if strings.HasPrefix(fixture, "two") {
		base = "two-workers"
	}
	source := filepath.Join("../../testdata/parity-local/edge-workers", base)
	if err := filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		edgeWrite(t, dir, rel, data, 0644)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	names := []string{"headers"}
	if base == "two-workers" {
		names = []string{"a", "b"}
	}
	if fixture == "no-workers" {
		if err := os.RemoveAll(filepath.Join(dir, "workers")); err != nil {
			t.Fatal(err)
		}
		names = nil
	}
	if fixture == "unicode-compiler" {
		names = []string{"headers", "ä", "Alpha", "zebra", "Álpha", "é"}
		for _, name := range names[1:] {
			manifest, _ := json.Marshal(map[string]any{"name": name, "entry": "assembly/index.ts"}, json.Deterministic(true))
			edgeWrite(t, dir, "workers/"+name+"/worker.json", manifest, 0644)
			edgeWrite(t, dir, "workers/"+name+"/assembly/index.ts", []byte("// fixture source\n"), 0644)
		}
	}
	wasm := []byte{0, 97, 115, 109, 1, 0, 0, 0}
	if fixture != "no-artifact" {
		for _, name := range names {
			edgeWrite(t, dir, "build/"+name+".wasm", wasm, 0644)
		}
	}
	switch fixture {
	case "location-clear", "location-replace", "entry-escape":
		manifest := map[string]any{"name": "headers", "entry": "assembly/index.ts"}
		if fixture == "location-clear" {
			manifest["location"] = nil
		}
		if fixture == "location-replace" {
			manifest["location"] = map[string]any{"operator": "starts_with", "value": "/api/"}
		}
		if fixture == "entry-escape" {
			manifest["entry"] = "../../../escape.ts"
		}
		data, _ := json.Marshal(manifest, json.Deterministic(true))
		edgeWrite(t, dir, "workers/headers/worker.json", data, 0644)
	case "source-empty":
		edgeWrite(t, dir, "workers/headers/assembly/index.ts", nil, 0644)
	case "duplicates":
		edgeWrite(t, dir, "workers/duplicate/worker.json", []byte(`{"name":"HEADERS","entry":"assembly/index.ts"}`), 0644)
	case "artifact-symlink":
		target := filepath.Join(dir, "build/headers.wasm")
		if err := os.Remove(target); err != nil {
			t.Fatal(err)
		}
		outside := filepath.Join(t.TempDir(), "sentinel")
		if err := os.WriteFile(outside, wasm, 0644); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(outside, target); err != nil {
			t.Fatal(err)
		}
	}
	if strings.Contains(fixture, "compiler") {
		script := "#!/usr/bin/env node\nconst fs=require('node:fs'); const args=process.argv.slice(2); fs.writeFileSync(args[args.indexOf('--outFile')+1],Buffer.from('AGFzbQEAAAA=','base64'));\n"
		if fixture == "compiler-error" {
			script = "#!/usr/bin/env node\nprocess.stderr.write('fixture compiler error\\n');process.exit(1);\n"
		}
		edgeWrite(t, dir, "node_modules/.bin/asc", []byte(script), 0755)
	}
	return dir
}
func edgeTree(t *testing.T, dir string) map[string]string {
	t.Helper()
	out := map[string]string{}
	err := filepath.WalkDir(dir, func(path string, e fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, path)
		if e.IsDir() {
			if e.Name() == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}
		if e.Type()&os.ModeSymlink != 0 {
			out[rel] = "<fixture symlink>"
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		out[rel] = base64.StdEncoding.EncodeToString(data)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestEdgeWorkersDifferentialParity(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("Edge Workers real Node-vs-Go comparisons", skip))
	}
	names := make([]string, 0, len(edgeWorkerScenarios))
	for name := range edgeWorkerScenarios {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			tc := edgeWorkerScenarios[name]
			s, err := LoadScenario("../../testdata/parity/" + name + ".yaml")
			if err != nil {
				t.Fatal(err)
			}
			if s.ExpectedDrift != nil {
				t.Fatal("Edge Workers must not broaden accepted drift")
			}
			// Preserve the existing cutover contract, docs/CUTOVER-BREAKING-CHANGES.md
			// section 1.10 for the known runtime banner and error-prefix spacing.
			// The approved executable-name difference is checked separately below.
			s.Normalize.Stdout = []NormalizeRule{{Pattern: `(?m)^Debug:  VIP-CLI v[^,\n]+, Node v[^,\n]+, [^,\n]+, Runtime node-script\n`, Replacement: ""}}
			s.Normalize.Stderr = []NormalizeRule{{Pattern: `(?m)^Error:  `, Replacement: "Error: "}}
			results := make([]*RunResult, 2)
			trees := make([]map[string]string, 2)
			requests := make([][]edgeObservation, 2)
			for side, bin := range []string{rig.nodeBin, rig.goBin} {
				dir := edgeFixtureProject(t, tc.Fixture)
				api := newEdgeFixtureAPI(tc.State)
				rig.serve(t, api)
				args := make([]string, len(s.Argv))
				for i, arg := range s.Argv {
					args[i] = strings.ReplaceAll(arg, "PROJECT_DIR", dir)
				}
				result, err := Run(RunSpec{Binary: bin, Dir: dir, Argv: args, Env: FixtureEnv(rig.scenarioEnv(s))})
				if err != nil {
					t.Fatal(err)
				}
				result.Stdout = strings.ReplaceAll(result.Stdout, dir, "PROJECT_DIR")
				result.Stderr = strings.ReplaceAll(result.Stderr, dir, "PROJECT_DIR")
				// Each runtime's init/new guidance must invoke that runtime. Only
				// normalize these known prefixes after checking the actual output.
				// See CUTOVER-BREAKING-CHANGES.md section 1.28.
				guidance := ""
				if result.ExitCode == 0 && s.Argv[1] == "init" {
					guidance = "edge-workers new my-worker\n"
				} else if result.ExitCode == 0 && s.Argv[1] == "new" {
					guidance = "@my-site.develop edge-workers deploy "
				}
				if guidance != "" {
					executable := "vip"
					if side == 1 {
						executable = "vip-next"
					}
					prefix := "\n  " + executable + " " + guidance
					if !strings.Contains(result.Stdout, prefix) {
						t.Errorf("side %d missing runtime-specific guidance %q: %s", side, prefix, result.Stdout)
					}
					if side == 1 {
						result.Stdout = strings.Replace(result.Stdout, prefix, "\n  vip "+guidance, 1)
					}
				}
				results[side] = result
				if name == "edge-workers-get-source" {
					// Check readability independently: matching runtimes can share a bug.
					_, source, found := strings.Cut(result.Stdout, "\nSource:\n")
					want := "// café\nexport function run(): void {\n\t// controls: \\u001b[2J\\u0000\\u0008\\u000d\\u007f\\u0085\\u009b31m\n}\n// literal: \\u000a\n\n"
					if !found || source != want {
						t.Errorf("side %d source = %q, want %q", side, source, want)
					}
				}
				ops, observations := api.snapshot()
				for _, observation := range observations {
					if observation.Operation == "EdgeWorkerDetail" {
						wantSource := false
						for _, arg := range s.Argv {
							if arg == "--source" {
								wantSource = true
							}
						}
						if observation.Source != wantSource {
							t.Errorf("side %d source selection = %v want %v", side, observation.Source, wantSource)
						}
					}
				}
				requests[side] = observations
				trees[side] = edgeTree(t, dir)
				if result.ExitCode != tc.WantExit || result.ExitCode != s.Expect.ExitCode {
					t.Errorf("side %d exit %d, want %d: stdout=%s stderr=%s", side, result.ExitCode, tc.WantExit, result.Stdout, result.Stderr)
				}
				if !reflect.DeepEqual(ops, tc.WantPersistentOps) {
					t.Errorf("side %d persistent operations %v, want %v", side, ops, tc.WantPersistentOps)
				}
			}
			diff, err := Diff(s, results[0], results[1])
			if err != nil {
				t.Fatal(err)
			}
			if !diff.Equal {
				t.Errorf("%s\n%s\n%s", diff.ExitCodeDelta, diff.StdoutDelta, diff.StderrDelta)
			}
			if !reflect.DeepEqual(trees[0], trees[1]) {
				t.Error("filesystem effects differ between Node and Go")
				for path, data := range trees[0] {
					if trees[1][path] != data {
						t.Logf("file differs: %s", path)
					}
				}
			}
			if !reflect.DeepEqual(requests[0], requests[1]) {
				t.Errorf("semantic API requests differ:\nNode: %#v\nGo: %#v", requests[0], requests[1])
			}
		})
	}
}

func TestEdgeWorkersScenarioInventory(t *testing.T) {
	for name := range edgeWorkerScenarios {
		if _, err := LoadScenario("../../testdata/parity/" + name + ".yaml"); err != nil {
			t.Error(err)
		}
		if _, ok := surfaceDifferentialScenarios[name]; ok {
			t.Errorf("duplicate ownership: %s", name)
		}
	}
}

package commands

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/edgeworkers"
	"github.com/Automattic/vip/internal/nodeflags"
	"github.com/Automattic/vip/internal/telemetry"
	"github.com/Khan/genqlient/graphql"
	"github.com/spf13/cobra"
)

type edgeEvent struct {
	name  string
	props map[string]any
}
type edgeEventRecorder struct{ events []edgeEvent }

func (r *edgeEventRecorder) TrackEvent(name string, props map[string]any) error {
	r.events = append(r.events, edgeEvent{name, props})
	return nil
}
func TestEdgeWorkersTelemetry(t *testing.T) {
	edgeCommandConfig(t)
	for _, key := range []string{"DO_NOT_TRACK", "GO_ENV", "NODE_ENV"} {
		t.Setenv(key, "")
	}
	recorder := &edgeEventRecorder{}
	cfg := GetConfig()
	cfg.Tracker = &telemetry.Tracker{Clients: []telemetry.Client{recorder}}
	SetConfig(cfg)
	dir := edgeTestProject(t)
	api := &edgeCommandAPI{valid: true}
	deps := edgeWorkersDeps{Getwd: func() (string, error) { return dir, nil }, Service: edgeworkers.Service{API: api}}
	if _, err := runEdgeCommand(t, deps, "deploy", "headers", "--app=42", "--env=develop", "--skip-build"); err != nil {
		t.Fatal(err)
	}
	want := []edgeEvent{{"edge_workers_deploy_command_execute", map[string]any{"app_id": int64(42), "env_id": int64(8), "name": "headers", "all": false}}, {"edge_workers_deploy_command_success", map[string]any{"app_id": int64(42), "env_id": int64(8), "count": 1, "enable": false, "activeCount": 0}}}
	if !reflect.DeepEqual(recorder.events, want) {
		t.Fatalf("events %#v", recorder.events)
	}
	recorder.events = nil
	if _, err := runEdgeCommand(t, deps, "deploy", "headers", "--all", "--app=42", "--env=develop"); err == nil {
		t.Fatal("accepted conflict")
	}
	if len(recorder.events) != 2 || recorder.events[1].name != "edge_workers_deploy_command_error" || recorder.events[1].props["error"] != "deploy_failed" {
		t.Fatalf("events %#v", recorder.events)
	}
}

type edgeCommandAPI struct {
	edgeworkers.API
	calls       []string
	workers     []edgeworkers.Worker
	valid       bool
	enableError error
}

func (a *edgeCommandAPI) List(context.Context, int64, int64) ([]edgeworkers.Worker, error) {
	a.calls = append(a.calls, "list")
	return a.workers, nil
}
func (a *edgeCommandAPI) Get(_ context.Context, _, _ int64, name string, source bool) (*edgeworkers.Worker, error) {
	a.calls = append(a.calls, fmt.Sprintf("get:%s:%v", name, source))
	for _, w := range a.workers {
		if w.Name == name {
			return &w, nil
		}
	}
	return nil, nil
}
func (a *edgeCommandAPI) Validate(context.Context, int64, string) (edgeworkers.ValidationResult, error) {
	a.calls = append(a.calls, "validate")
	return edgeworkers.ValidationResult{Valid: a.valid, Errors: []string{"bad wasm"}, Phases: []string{"client_response"}}, nil
}
func (a *edgeCommandAPI) Create(_ context.Context, _ int64, in edgeworkers.WriteInput) (edgeworkers.Worker, error) {
	a.calls = append(a.calls, "create:"+in.Name)
	return edgeworkers.Worker{ID: 9, Name: in.Name, Phases: []string{"client_response"}}, nil
}
func (a *edgeCommandAPI) SetActive(_ context.Context, _, _ int64, active bool) (edgeworkers.Worker, error) {
	a.calls = append(a.calls, fmt.Sprintf("active:%v", active))
	return edgeworkers.Worker{ID: 9, Name: "headers", Active: active}, a.enableError
}
func (a *edgeCommandAPI) Delete(context.Context, int64, int64) error {
	a.calls = append(a.calls, "delete")
	return nil
}

type edgeCommandBuilder struct {
	calls []string
	err   error
}

func (b *edgeCommandBuilder) Build(_ context.Context, dir string, w edgeworkers.LocalWorker) (edgeworkers.Artifact, error) {
	b.calls = append(b.calls, w.Manifest.Name)
	return edgeworkers.Artifact{Path: filepath.Join(dir, "build", w.Manifest.Name+".wasm"), Base64: "AGFzbQEAAAA=", SizeBytes: 8}, b.err
}

func edgeCommandConfig(t *testing.T) {
	t.Helper()
	old := GetConfig()
	t.Cleanup(func() { SetConfig(old) })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"data":{"app":{"id":42,"name":"example-app","environments":[{"id":7,"appId":7,"name":"production","type":"production"},{"id":8,"appId":8,"name":"develop","type":"develop"}]}}}`)
	}))
	t.Cleanup(server.Close)
	client := graphql.NewClient(server.URL, server.Client())
	SetConfig(Config{GQLClient: client, AppCtxConfig: appctx.AppContextConfig{Client: client}})
}
func runEdgeCommand(t *testing.T, deps edgeWorkersDeps, args ...string) (string, error) {
	t.Helper()
	root := &cobra.Command{Use: "vip-next", SilenceUsage: true, SilenceErrors: true}
	root.PersistentFlags().Bool("non-interactive", false, "Disable prompts")
	root.AddCommand(newEdgeWorkersCmd(deps))
	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)
	root.SetArgs(nodeflags.NormalizeOptionalValues(root, append([]string{"edge-workers"}, args...)))
	err := root.Execute()
	return out.String(), err
}
func edgeTestProject(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := edgeworkers.ScaffoldProject(dir, "assemblyscript"); err != nil {
		t.Fatal(err)
	}
	if err := edgeworkers.ScaffoldWorker(dir, "headers", nil); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "build"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "build", "headers.wasm"), []byte{0, 97, 115, 109, 1, 0, 0, 0}, 0600); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestEdgeWorkersLocalCommands(t *testing.T) {
	edgeCommandConfig(t)
	dir := t.TempDir()
	builder := &edgeCommandBuilder{}
	deps := edgeWorkersDeps{Getwd: func() (string, error) { return dir, nil }, Service: edgeworkers.Service{Builder: builder}}
	out, err := runEdgeCommand(t, deps, "init")
	if err != nil || !strings.Contains(out, "✓ Created a new assemblyscript") {
		t.Fatalf("%s %v", out, err)
	}
	if !strings.Contains(out, "\n  vip-next edge-workers new my-worker\n") {
		t.Fatalf("init guidance invokes another runtime: %s", out)
	}
	out, err = runEdgeCommand(t, deps, "new", "headers", "-l=starts_with:/api/")
	if err != nil || !strings.Contains(out, `Scope: starts_with "/api/".`) {
		t.Fatalf("%s %v", out, err)
	}
	if !strings.Contains(out, "\n  vip-next @my-site.develop edge-workers deploy headers\n") {
		t.Fatalf("new guidance invokes another runtime: %s", out)
	}
	out, err = runEdgeCommand(t, deps, "build", "headers")
	if err != nil || out != "✓ Built \"headers\" → build/headers.wasm (8 bytes)\n" {
		t.Fatalf("%q %v", out, err)
	}
	for _, args := range [][]string{{"new", "bad", "--location"}, {"new", "bad", "--path"}, {"new", "bad", "--path=x", "--path=y"}, {"build", "headers", "--all"}, {"init", "--type"}} {
		if _, err := runEdgeCommand(t, deps, args...); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "edge-workers/workers/bad")); !os.IsNotExist(err) {
		t.Fatal("invalid input left worker")
	}
}

func TestEdgeWorkersProductionAndLifecycle(t *testing.T) {
	edgeCommandConfig(t)
	dir := edgeTestProject(t)
	for _, skip := range []bool{false, true} {
		api := &edgeCommandAPI{valid: true}
		deps := edgeWorkersDeps{Getwd: func() (string, error) { return dir, nil }, Service: edgeworkers.Service{API: api}, IsInteractive: func(*cobra.Command) bool { return true }, StdoutTTY: func(*cobra.Command) bool { return false }, Confirm: func(*cobra.Command, string, bool) (bool, error) {
			t.Fatal("prompted redirected stdout")
			return false, nil
		}}
		args := []string{"deploy", "headers", "--app=42", "--env=production", "--skip-build"}
		if skip {
			args = append(args, "--skip-confirmation")
		}
		out, err := runEdgeCommand(t, deps, args...)
		if skip {
			if err != nil || !strings.Contains(out, "created \"headers\"; inactive") || !strings.Contains(out, "Review created inactive") {
				t.Fatalf("%s %v", out, err)
			}
		} else if err == nil || !strings.Contains(err.Error(), "Refusing to deploy") {
			t.Fatalf("%s %v", out, err)
		}
		if strings.Contains(strings.Join(api.calls, ","), "create:") != skip {
			t.Fatalf("calls %v", api.calls)
		}
	}
	for _, action := range []string{"enable", "disable", "delete"} {
		api := &edgeCommandAPI{workers: []edgeworkers.Worker{{ID: 9, Name: "headers"}}}
		prompts := 0
		deps := edgeWorkersDeps{Service: edgeworkers.Service{API: api}, IsInteractive: func(*cobra.Command) bool { return true }, StdoutTTY: func(*cobra.Command) bool { return true }, Confirm: func(*cobra.Command, string, bool) (bool, error) { prompts++; return false, nil }}
		_, err := runEdgeCommand(t, deps, action, "headers", "--app=42", "--env=production")
		if action == "disable" {
			if err != nil || prompts != 0 {
				t.Fatalf("disable %v", err)
			}
		} else if err == nil || !strings.Contains(err.Error(), "cancelled") || len(api.calls) != 1 {
			t.Fatalf("%s %v %v", action, err, api.calls)
		}
	}
	api := &edgeCommandAPI{valid: true, enableError: errors.New("timeout")}
	deps := edgeWorkersDeps{Getwd: func() (string, error) { return dir, nil }, Service: edgeworkers.Service{API: api}}
	out, err := runEdgeCommand(t, deps, "deploy", "headers", "--app=42", "--env=develop", "--skip-build", "--enable")
	if err == nil || !strings.Contains(err.Error(), "Final active state is unknown") || strings.Contains(out, "✓ created") {
		t.Fatalf("%s %v", out, err)
	}
}

func TestEdgeWorkersReadsAndValidation(t *testing.T) {
	edgeCommandConfig(t)
	dir := edgeTestProject(t)
	empty := ""
	api := &edgeCommandAPI{workers: []edgeworkers.Worker{{ID: 9, Name: "headers", Source: &empty}}, valid: false}
	deps := edgeWorkersDeps{Getwd: func() (string, error) { return dir, nil }, Service: edgeworkers.Service{API: api}}
	out, err := runEdgeCommand(t, deps, "list", "--app=42", "--env=develop", "--format=json")
	if err != nil || !strings.Contains(out, `"id": 9`) || strings.Contains(out, "source") {
		t.Fatalf("%s %v", out, err)
	}
	out, err = runEdgeCommand(t, deps, "get", "headers", "--app=42", "--env=develop", "--source")
	if err != nil || !strings.HasSuffix(out, "\nSource:\n\n") {
		t.Fatalf("%q %v", out, err)
	}
	out, err = runEdgeCommand(t, deps, "validate", "headers", "--app=42", "--env=develop", "--skip-build")
	if err == nil || !strings.Contains(err.Error(), "1 worker(s) failed validation") || !strings.Contains(out, "is invalid: bad wasm") {
		t.Fatalf("%s %v", out, err)
	}
}

func TestEdgeWorkersNonInteractiveIsNotConfirmation(t *testing.T) {
	edgeCommandConfig(t)
	dir := edgeTestProject(t)
	for _, args := range [][]string{
		{"deploy", "headers", "--skip-build", "--non-interactive"},
		{"deploy", "headers", "--skip-build", "--skip-confirmation=false"},
		{"enable", "headers", "--skip-confirmation=false"},
		{"delete", "headers", "--force=false"},
	} {
		api := &edgeCommandAPI{valid: true, workers: []edgeworkers.Worker{{ID: 9, Name: "headers"}}}
		deps := edgeWorkersDeps{Getwd: func() (string, error) { return dir, nil }, Service: edgeworkers.Service{API: api}, Confirm: func(*cobra.Command, string, bool) (bool, error) { return false, appctx.ErrNonInteractive }}
		args = append(args, "--app=42", "--env=production")
		_, err := runEdgeCommand(t, deps, args...)
		if err == nil {
			t.Fatalf("accepted %v", args)
		}
		for _, call := range api.calls {
			if call != "list" && call != "validate" {
				t.Fatalf("mutation without confirmation: %v", api.calls)
			}
		}
	}
}

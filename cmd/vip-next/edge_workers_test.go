package main

import (
	"bytes"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/envalias"
	"github.com/spf13/cobra"
)

func TestEdgeWorkersRootAndParsing(t *testing.T) {
	root := newRootCmd(&rootContext{})
	parent, _, err := root.Find([]string{"edge-workers"})
	if err != nil || parent.Name() != "edge-workers" {
		t.Fatalf("parent %v %v", parent, err)
	}
	names := []string{}
	for _, c := range parent.Commands() {
		names = append(names, c.Name())
	}
	sort.Strings(names)
	if !reflect.DeepEqual(names, []string{"build", "delete", "deploy", "disable", "enable", "get", "init", "list", "new", "validate"}) {
		t.Fatalf("commands %v", names)
	}
	for _, tc := range []struct {
		args     []string
		wantArgs []string
		values   map[string]string
	}{
		{[]string{"@example-app.develop", "edge-workers", "deploy", "headers", "-s", "-p=./project"}, []string{"headers"}, map[string]string{"app": "example-app", "env": "develop", "path": "./project", "skip-build": "true"}},
		{[]string{"edge-workers", "new", "headers", "-p", "./project", "-l=equals:/x"}, []string{"headers"}, map[string]string{"path": "./project", "location": "equals:/x"}},
		{[]string{"edge-workers", "new", "--path", "--", "@literal"}, []string{"@literal"}, map[string]string{"path": "\x00"}},
		{[]string{"edge-workers", "init", "--type=assemblyscript"}, []string{}, map[string]string{"type": "assemblyscript"}},
	} {
		rewritten, app, env, err := envalias.Rewrite(tc.args)
		if err != nil {
			t.Fatal(err)
		}
		root := newRootCmd(&rootContext{aliasApp: app, aliasEnv: env})
		leaf, _, err := root.Find(rewritten)
		if err != nil {
			t.Fatal(err)
		}
		called := false
		leaf.RunE = func(c *cobra.Command, args []string) error {
			called = true
			if strings.Join(args, "|") != strings.Join(tc.wantArgs, "|") {
				t.Fatalf("args %v", args)
			}
			for k, v := range tc.values {
				if f := c.Flag(k); f == nil || f.Value.String() != v {
					t.Fatalf("flag %s=%v want %q", k, f, v)
				}
			}
			return nil
		}
		root.SetArgs(prepareArgs(root, rewritten))
		if err := root.Execute(); err != nil {
			t.Fatal(err)
		}
		if !called {
			t.Fatal("handler not reached")
		}
	}
}

func TestEdgeWorkersHelpDoesNotExposeBareFlagMarker(t *testing.T) {
	root := newRootCmd(&rootContext{})
	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)
	root.SetArgs([]string{"edge-workers", "new", "--help"})
	if err := root.Execute(); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "\x00") || strings.Contains(out.String(), `\x00`) {
		t.Fatalf("internal marker exposed in help: %q", out.String())
	}
}

func TestEdgeWorkersHelpUsesGoExecutable(t *testing.T) {
	parent, _, _ := newRootCmd(&rootContext{}).Find([]string{"edge-workers"})
	for _, command := range parent.Commands() {
		t.Run(command.Name(), func(t *testing.T) {
			root := newRootCmd(&rootContext{})
			var out bytes.Buffer
			root.SetOut(&out)
			root.SetErr(&out)
			root.SetArgs([]string{"edge-workers", command.Name(), "--help"})
			if err := root.Execute(); err != nil {
				t.Fatal(err)
			}
			_, examples, found := strings.Cut(out.String(), "Examples:\n")
			if !found {
				t.Fatalf("missing examples: %s", out.String())
			}
			examples, _, _ = strings.Cut(examples, "\n\n")
			for _, example := range strings.Split(strings.TrimSpace(examples), "\n") {
				if !strings.HasPrefix(strings.TrimSpace(example), "vip-next ") {
					t.Errorf("example invokes another runtime: %q", example)
				}
			}
		})
	}
}

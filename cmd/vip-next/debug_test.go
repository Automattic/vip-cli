package main

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/Automattic/vip/cmd/vip-next/commands"
	"github.com/Automattic/vip/internal/debuglog"
	"github.com/spf13/cobra"
)

func TestDebugEnablesDiagnosticsOnStderr(t *testing.T) {
	for _, tc := range []struct {
		name    string
		args    []string
		env     string
		enabled bool
	}{
		{"default", nil, "", false},
		{"short", []string{"-d"}, "", true},
		{"long", []string{"--debug"}, "", true},
		{"equals", []string{"-d=@automattic/vip:http"}, "", true},
		{"separate", []string{"--debug", "@automattic/vip:http"}, "", true},
		{"separate nonmatching", []string{"--debug", "unrelated"}, "", false},
		{"excluded", []string{"--debug=*,-@automattic/vip:http"}, "", false},
		{"environment", nil, "@automattic/vip:*", true},
		{"flag overrides environment", []string{"--debug=other"}, "*", false},
		{"empty flag keeps environment", []string{"--debug="}, "*", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DEBUG", tc.env)
			var stdout, stderr bytes.Buffer
			root := newRootBase(&rootContext{})
			root.SetOut(&stdout)
			root.SetErr(&stderr)
			root.AddCommand(&cobra.Command{Use: "probe", RunE: func(cmd *cobra.Command, args []string) error {
				if len(args) != 0 {
					t.Fatalf("namespace leaked into positional arguments: %q", args)
				}
				debuglog.Printf(cmd.Context(), "@automattic/vip:http", "running fetch")
				_, err := fmt.Fprintln(cmd.OutOrStdout(), `{"ok":true}`)
				return err
			}})
			root.SetArgs(prepareArgs(root, append([]string{"probe"}, tc.args...)))
			if err := root.Execute(); err != nil {
				t.Fatal(err)
			}
			if stdout.String() != "{\"ok\":true}\n" {
				t.Fatalf("stdout polluted: %q", stdout.String())
			}
			if got := strings.Contains(stderr.String(), "running fetch"); got != tc.enabled {
				t.Fatalf("diagnostics enabled=%v, want %v; stderr=%q", got, tc.enabled, stderr.String())
			}
		})
	}
}

func TestWPDebugBeforeCommandPreservesPassthrough(t *testing.T) {
	for _, tc := range []struct {
		args    []string
		want    []string
		enabled bool
	}{
		{[]string{"-d", "wp", "option", "get", "secret", "--debug"}, []string{"option", "get", "secret", "--debug"}, true},
		{[]string{"--debug=@automattic/vip:wp", "wp", "--", "--debug"}, []string{"--", "--debug"}, true},
		{[]string{"--debug", "@automattic/vip:wp", "wp", "option", "get"}, []string{"option", "get"}, true},
		{[]string{"--debug", "@automattic/vip:wp", "--", "wp", "user", "list"}, []string{"user", "list"}, true},
		{[]string{"--debug", "@automattic/vip:wp", "--yes", "wp", "user", "list"}, []string{"user", "list"}, true},
		{[]string{"wp", "--debug"}, []string{"--debug"}, false},
	} {
		t.Run(strings.Join(tc.args, " "), func(t *testing.T) {
			t.Setenv("DEBUG", "")
			var stderr bytes.Buffer
			root := newRootBase(&rootContext{})
			root.SetErr(&stderr)
			wp := commands.WPCmd()
			wp.RunE = func(cmd *cobra.Command, args []string) error {
				if strings.Join(args, "|") != strings.Join(tc.want, "|") {
					t.Fatalf("passthrough changed: %q", args)
				}
				debuglog.Printf(cmd.Context(), "@automattic/vip:wp", "connect")
				return nil
			}
			root.AddCommand(wp)
			normalized, _ := normalizeWPArgs(tc.args)
			root.SetArgs(prepareArgs(root, normalized))
			if err := root.Execute(); err != nil {
				t.Fatal(err)
			}
			if (stderr.Len() > 0) != tc.enabled {
				t.Fatalf("debug output=%q, enabled=%v", stderr.String(), tc.enabled)
			}
		})
	}
}

func TestDebugSelectorPositions(t *testing.T) {
	for _, argv := range [][]string{
		{"--debug", "selected", "parent", "leaf"},
		{"parent", "-d", "selected", "leaf"},
		{"parent", "leaf", "--debug", "selected"},
	} {
		t.Run(strings.Join(argv, " "), func(t *testing.T) {
			root := newRootBase(&rootContext{})
			parent := &cobra.Command{Use: "parent"}
			parent.AddCommand(&cobra.Command{Use: "leaf", RunE: func(cmd *cobra.Command, args []string) error {
				selector, _ := cmd.Flags().GetString("debug")
				if selector != "selected" || len(args) != 0 {
					t.Fatalf("selector=%q args=%q", selector, args)
				}
				return nil
			}})
			root.AddCommand(parent)
			root.SetArgs(prepareArgs(root, argv))
			if err := root.Execute(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

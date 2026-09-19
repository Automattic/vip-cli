package auth

import (
	"os"
	"testing"
)

func TestShouldBypassAuth(t *testing.T) {
	tests := []struct {
		name string
		argv []string
		env  map[string]string
		want bool
	}{
		{"help short", []string{"--help"}, nil, true},
		{"help long", []string{"app", "list", "--help"}, nil, true},
		{"help word", []string{"help"}, nil, true},
		{"-h", []string{"-h"}, nil, true},
		{"version short", []string{"-v"}, nil, true},
		{"version long", []string{"--version"}, nil, true},
		{"logout", []string{"logout"}, nil, true},
		{"dev-env no alias", []string{"dev-env", "start"}, nil, true},
		{"dev-env with alias", []string{"dev-env", "@my-app", "destroy"}, nil, false},
		{"deploy with env token", []string{"app", "deploy"}, map[string]string{"WPVIP_DEPLOY_TOKEN": "x"}, true},
		{"deploy without env token", []string{"app", "deploy"}, nil, false},
		{"plain command", []string{"app", "list"}, nil, false},
		{name: "login bypasses", argv: []string{"login"}, want: true},
		{name: "login with flags bypasses", argv: []string{"login", "--debug"}, want: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, set := tc.env["WPVIP_DEPLOY_TOKEN"]; !set {
				os.Unsetenv("WPVIP_DEPLOY_TOKEN")
			}
			for k, v := range tc.env {
				t.Setenv(k, v)
			}
			got := ShouldBypassAuth(tc.argv)
			if got != tc.want {
				t.Errorf("ShouldBypassAuth(%v) = %v, want %v", tc.argv, got, tc.want)
			}
		})
	}
}

func TestDevEnvSyncRequiresAuth(t *testing.T) {
	if ShouldBypassAuth([]string{"dev-env", "sync", "sql", "--slug", "x"}) {
		t.Fatal("dev-env sync must NOT bypass auth (it calls the platform)")
	}
}

// TestDevEnvWithAppEnvFlagsRequiresAuth pins Node's containsAppEnvArgument
// (src/lib/cli/command.js:1128-1134), which counts BOTH the @app.env alias and
// the bare --app/--env flags. vip-next only looked for the alias, so
// `dev-env create --app example` skipped auth and the create wizard silently
// lost every app-derived default.
func TestDevEnvWithAppEnvFlagsRequiresAuth(t *testing.T) {
	cases := [][]string{
		{"dev-env", "create", "--app", "example"},
		{"dev-env", "create", "--env", "develop"},
	}
	for _, argv := range cases {
		if ShouldBypassAuth(argv) {
			t.Errorf("ShouldBypassAuth(%v) = true; --app/--env is an app/env argument in Node", argv)
		}
	}
}

// TestDevEnvAppEnvArgumentMatchesNodeExactTokenScan pins the two ways Node's
// containsAppEnvArgument is *sloppier* than the alias parser it wraps.
// `argv.includes('--app')` is an exact-token, whole-argv scan, so:
//
//   - `--app=example` is NOT recognised (Node bug: the wizard bypasses login),
//     whereas the alias half of the same function stops at `--`;
//   - a `--app` token appearing AFTER `--` IS recognised.
//
// Both are Node's shipping behaviour. They are harmless in practice because a
// bypassed invocation still gets a configured API client on both CLIs (Node
// loads the token per request in api/http.ts) — it only decides whether an
// unauthenticated user gets a login prompt or a 401.
func TestDevEnvAppEnvArgumentMatchesNodeExactTokenScan(t *testing.T) {
	if !ShouldBypassAuth([]string{"dev-env", "create", "--app=example"}) {
		t.Error("Node's argv.includes('--app') does not match the --app=value form")
	}
	if ShouldBypassAuth([]string{"dev-env", "exec", "--", "wp", "option", "get", "--app"}) {
		t.Error("Node's flag scan is not bounded by --; a later --app still counts")
	}
}

func TestDevEnvNonSyncStillBypasses(t *testing.T) {
	if !ShouldBypassAuth([]string{"dev-env", "start", "--slug", "x"}) {
		t.Fatal("dev-env start should still bypass auth")
	}
	if !ShouldBypassAuth([]string{"dev-env", "import", "sql", "f.sql"}) {
		t.Fatal("dev-env import should still bypass auth")
	}
}

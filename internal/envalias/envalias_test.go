package envalias

import (
	"reflect"
	"testing"
)

func TestRewrite(t *testing.T) {
	tests := []struct {
		name     string
		argv     []string
		wantArgv []string
		wantApp  string
		wantEnv  string
	}{
		{
			name:     "no alias passes through",
			argv:     []string{"app", "list"},
			wantArgv: []string{"app", "list"},
		},
		{
			name:     "alias at position 0, app only",
			argv:     []string{"@my-app", "app", "list"},
			wantArgv: []string{"app", "list"},
			wantApp:  "my-app",
		},
		{
			name:     "alias at position 0, app and env",
			argv:     []string{"@my-app.staging", "app", "list"},
			wantArgv: []string{"app", "list"},
			wantApp:  "my-app",
			wantEnv:  "staging",
		},
		{
			name:     "alias after subcommand",
			argv:     []string{"app", "list", "@my-app.staging"},
			wantArgv: []string{"app", "list"},
			wantApp:  "my-app",
			wantEnv:  "staging",
		},
		{
			name:     "alias trailing after flags",
			argv:     []string{"something", "--argument=value", "@my-app"},
			wantArgv: []string{"something", "--argument=value"},
			wantApp:  "my-app",
		},
		{
			name:     "alias between subcommand and flag",
			argv:     []string{"app", "@my-app.staging", "--debug"},
			wantArgv: []string{"app", "--debug"},
			wantApp:  "my-app",
			wantEnv:  "staging",
		},
		{
			name:     "token after `--` is not parsed",
			argv:     []string{"wp", "--", "@plugin", "activate"},
			wantArgv: []string{"wp", "--", "@plugin", "activate"},
		},
		{
			name:     "alias before `--` is parsed, tokens after are preserved",
			argv:     []string{"@my-app", "wp", "--", "@plugin", "activate"},
			wantArgv: []string{"wp", "--", "@plugin", "activate"},
			wantApp:  "my-app",
		},
		{
			name:     "mixed case is lowercased (Node parity)",
			argv:     []string{"@MyApp.Prod", "app", "list"},
			wantArgv: []string{"app", "list"},
			wantApp:  "myapp",
			wantEnv:  "prod",
		},
		{
			name:     "instance-qualified env: three dotted segments",
			argv:     []string{"@app.env.instance", "wp"},
			wantArgv: []string{"wp"},
			wantApp:  "app",
			wantEnv:  "env.instance",
		},
		{
			name:     "underscore in env name",
			argv:     []string{"@xxx.production_test", "wp"},
			wantArgv: []string{"wp"},
			wantApp:  "xxx",
			wantEnv:  "production_test",
		},
		{
			name:     "numeric app slug",
			argv:     []string{"@1.env", "wp"},
			wantArgv: []string{"wp"},
			wantApp:  "1",
			wantEnv:  "env",
		},
		{
			name:     "first alias consumed, second remains (Node parity)",
			argv:     []string{"@a", "app", "@b"},
			wantArgv: []string{"app", "@b"},
			wantApp:  "a",
		},
		{
			name:     "bare @ passes through (does not match isAlias)",
			argv:     []string{"@", "app"},
			wantArgv: []string{"@", "app"},
		},
		{
			name:     "@app. matches isAlias and parses with empty env",
			argv:     []string{"@app.", "list"},
			wantArgv: []string{"list"},
			wantApp:  "app",
			wantEnv:  "",
		},
		{
			name:     "@.env matches isAlias and parses with empty app",
			argv:     []string{"@.env", "list"},
			wantArgv: []string{"list"},
			wantApp:  "",
			wantEnv:  "env",
		},
		{
			name:     "empty argv",
			argv:     []string{},
			wantArgv: []string{},
		},
		{
			name:     "only --",
			argv:     []string{"--"},
			wantArgv: []string{"--"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotArgv, gotApp, gotEnv, err := Rewrite(tc.argv)
			if err != nil {
				t.Fatalf("Rewrite() unexpected err = %v", err)
			}
			if !reflect.DeepEqual(gotArgv, tc.wantArgv) {
				t.Errorf("argv = %v, want %v", gotArgv, tc.wantArgv)
			}
			if gotApp != tc.wantApp {
				t.Errorf("app = %q, want %q", gotApp, tc.wantApp)
			}
			if gotEnv != tc.wantEnv {
				t.Errorf("env = %q, want %q", gotEnv, tc.wantEnv)
			}
		})
	}
}

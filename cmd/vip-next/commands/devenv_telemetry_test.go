package commands

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/devenv/paths"
	"github.com/Automattic/vip/internal/telemetry"
	"github.com/spf13/cobra"
)

type devEnvCapturedEvent struct {
	name  string
	props map[string]any
}

type devEnvEventClient struct{ events []devEnvCapturedEvent }

func (c *devEnvEventClient) TrackEvent(name string, props map[string]any) error {
	copyProps := make(map[string]any, len(props))
	for k, v := range props {
		copyProps[k] = v
	}
	c.events = append(c.events, devEnvCapturedEvent{name: name, props: copyProps})
	return nil
}

func TestDevEnvTrackingInfoOmitsCredentials(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	slug := "example-site"
	if err := os.MkdirAll(paths.EnvironmentPath(slug), 0o755); err != nil {
		t.Fatal(err)
	}
	data := []byte(`{"siteSlug":"example-site","wpTitle":"Example Site","php":"php-fpm:8.4","adminPassword":"local-password","autologinKey":"local-key","envVars":{"API_TOKEN":"private-value"},"overrides":"API_TOKEN: private-value"}`)
	if err := os.WriteFile(filepath.Join(paths.EnvironmentPath(slug), "instance_data.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}

	got := devEnvTrackingInfo(slug)
	if got["slug"] != slug || got["site_slug"] != slug || got["wp_title"] != "Example Site" || got["php"] != "8.4" {
		t.Fatalf("safe tracking properties = %#v", got)
	}
	for _, key := range []string{"admin_password", "autologin_key", "env_vars", "overrides"} {
		if _, ok := got[key]; ok {
			t.Errorf("credential-bearing property %q was included", key)
		}
	}
}

func TestDevEnvTrackingInfoMissingRecord(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	got := devEnvTrackingInfo("missing")
	if len(got) != 1 || got["slug"] != "missing" {
		t.Fatalf("missing-record tracking properties = %#v, want slug only", got)
	}
}

func TestDevEnvTrackingInfoMapsLegacyFields(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	slug := "legacy-site"
	if err := os.MkdirAll(paths.EnvironmentPath(slug), 0o755); err != nil {
		t.Fatal(err)
	}
	data := []byte(`{"siteSlug":"legacy-site","clientCode":{"repo":"example"},"elasticsearchEnabled":true}`)
	if err := os.WriteFile(filepath.Join(paths.EnvironmentPath(slug), "instance_data.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	got := devEnvTrackingInfo(slug)
	if got["app_code"] != `{"repo":"example"}` || got["elasticsearch"] != true {
		t.Fatalf("legacy tracking properties = %#v", got)
	}
	if _, ok := got["client_code"]; ok {
		t.Fatalf("legacy field was sent directly: %#v", got)
	}
}

func TestDevEnvCommandTelemetryAfterSlugResolution(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	client := &devEnvEventClient{}
	old := GetConfig()
	SetConfig(Config{Tracker: &telemetry.Tracker{Clients: []telemetry.Client{client}}})
	t.Cleanup(func() { SetConfig(old) })

	root := &cobra.Command{Use: "dev-env"}
	info := &cobra.Command{Use: "info", RunE: func(cmd *cobra.Command, _ []string) error {
		_, err := ResolveSlug(cmd)
		return err
	}}
	addSlugFlag(info)
	root.AddCommand(info)
	installDevEnvTelemetry(root)
	root.SetArgs([]string{"info", "--slug=example-site"})
	if err := root.Execute(); err != nil {
		t.Fatal(err)
	}
	if len(client.events) != 2 || client.events[0].name != "dev_env_info_command_execute" || client.events[1].name != "dev_env_info_command_success" {
		t.Fatalf("events = %#v", client.events)
	}
	if client.events[0].props["slug"] != "example-site" {
		t.Fatalf("execute properties = %#v", client.events[0].props)
	}
}

func TestDevEnvTelemetryDoesNotStartBeforeSlugResolution(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	t.Chdir(t.TempDir())
	client := &devEnvEventClient{}
	old := GetConfig()
	SetConfig(Config{Tracker: &telemetry.Tracker{Clients: []telemetry.Client{client}}})
	t.Cleanup(func() { SetConfig(old) })

	root := &cobra.Command{Use: "dev-env"}
	info := &cobra.Command{Use: "info", RunE: func(cmd *cobra.Command, _ []string) error {
		_, err := ResolveSlug(cmd)
		return err
	}}
	addSlugFlag(info)
	root.AddCommand(info)
	installDevEnvTelemetry(root)
	root.SetArgs([]string{"info"})
	if err := root.Execute(); err == nil {
		t.Fatal("expected missing environment to fail")
	}
	if len(client.events) != 0 {
		t.Fatalf("events before slug resolution = %#v", client.events)
	}
}

func TestDevEnvTelemetryRecordsCommandError(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	client := &devEnvEventClient{}
	old := GetConfig()
	SetConfig(Config{Tracker: &telemetry.Tracker{Clients: []telemetry.Client{client}}})
	t.Cleanup(func() { SetConfig(old) })

	root := &cobra.Command{Use: "dev-env"}
	logs := &cobra.Command{Use: "logs", RunE: func(cmd *cobra.Command, _ []string) error {
		if _, err := ResolveSlug(cmd); err != nil {
			return err
		}
		return errors.New("log stream failed")
	}}
	addSlugFlag(logs)
	root.AddCommand(logs)
	installDevEnvTelemetry(root)
	root.SetArgs([]string{"logs", "--slug=example-site"})
	if err := root.Execute(); err == nil {
		t.Fatal("expected logs to fail")
	}
	if len(client.events) != 2 || client.events[1].name != "dev_env_logs_command_error" || client.events[1].props["failure"] != "log stream failed" {
		t.Fatalf("error events = %#v", client.events)
	}
}

func TestDevEnvCreateEmitsCommandEvents(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	t.Chdir(t.TempDir())
	client := &devEnvEventClient{}
	old := GetConfig()
	SetConfig(Config{Tracker: &telemetry.Tracker{Clients: []telemetry.Client{client}}})
	t.Cleanup(func() { SetConfig(old) })

	root := DevEnvCmd()
	root.SetOut(io.Discard)
	root.SetErr(io.Discard)
	root.SetArgs([]string{"create", "--slug=example-site", "--title=Example Site"})
	if err := root.Execute(); err != nil {
		t.Fatal(err)
	}
	if len(client.events) != 2 || client.events[0].name != "dev_env_create_command_execute" || client.events[1].name != "dev_env_create_command_success" {
		t.Fatalf("create events = %#v", client.events)
	}
	if client.events[0].props["slug"] != "example-site" {
		t.Fatalf("create properties = %#v", client.events[0].props)
	}
}

func TestDevEnvImportSQLTracksDumpType(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	file := filepath.Join(t.TempDir(), "export.sql")
	if err := os.WriteFile(file, []byte("-- ordinary SQL export\nCREATE TABLE wp_posts (id int);\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	client := &devEnvEventClient{}
	old := GetConfig()
	SetConfig(Config{Tracker: &telemetry.Tracker{Clients: []telemetry.Client{client}}})
	t.Cleanup(func() { SetConfig(old) })

	root := &cobra.Command{Use: "dev-env"}
	imp := &cobra.Command{Use: "import"}
	sql := &cobra.Command{Use: "sql", RunE: func(cmd *cobra.Command, _ []string) error {
		_, err := ResolveSlug(cmd)
		return err
	}}
	addSlugFlag(sql)
	imp.AddCommand(sql)
	root.AddCommand(imp)
	installDevEnvTelemetry(root)
	root.SetArgs([]string{"import", "sql", "--slug=example-site", file})
	if err := root.Execute(); err != nil {
		t.Fatal(err)
	}
	if len(client.events) != 2 || client.events[0].props["sqldump_type"] != "MYSQLDUMP" {
		t.Fatalf("import SQL events = %#v", client.events)
	}
}

func TestDevEnvEnvvarSetInvalidNameEvent(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	client := &devEnvEventClient{}
	old := GetConfig()
	SetConfig(Config{Tracker: &telemetry.Tracker{Clients: []telemetry.Client{client}}})
	t.Cleanup(func() { SetConfig(old) })

	root := DevEnvCmd()
	root.SetOut(io.Discard)
	root.SetErr(io.Discard)
	root.SetArgs([]string{"envvar", "set", "--slug=example-site", "invalid-name", "value"})
	if err := root.Execute(); err == nil {
		t.Fatal("expected invalid variable name to fail")
	}
	if len(client.events) != 2 || client.events[0].name != "dev_env_envvar_set_command_execute" || client.events[1].name != "dev_env_envvar_set_invalid_name" {
		t.Fatalf("invalid-name events = %#v", client.events)
	}
}

func TestDevEnvEventNamesCoverEveryCommandLeaf(t *testing.T) {
	root := DevEnvCmd()
	seen := map[string]bool{}
	var walk func(*cobra.Command, string)
	walk = func(parent *cobra.Command, prefix string) {
		for _, child := range parent.Commands() {
			path := strings.TrimSpace(prefix + " " + child.Name())
			if child.RunE != nil {
				if _, ok := devEnvEventNames[path]; !ok {
					t.Errorf("no event name for %q", path)
				}
				seen[path] = true
			}
			walk(child, path)
		}
	}
	walk(root, "")
	for path := range devEnvEventNames {
		if !seen[path] {
			t.Errorf("event name %q has no command leaf", path)
		}
	}
}

func TestDevEnvAllCommandUsesAllProperty(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	client := &devEnvEventClient{}
	old := GetConfig()
	SetConfig(Config{Tracker: &telemetry.Tracker{Clients: []telemetry.Client{client}}})
	t.Cleanup(func() { SetConfig(old) })

	root := &cobra.Command{Use: "dev-env"}
	info := &cobra.Command{Use: "info", RunE: func(*cobra.Command, []string) error { return nil }}
	info.Flags().Bool("all", false, "")
	root.AddCommand(info)
	installDevEnvTelemetry(root)
	root.SetArgs([]string{"info", "--all"})
	if err := root.Execute(); err != nil {
		t.Fatal(err)
	}
	if len(client.events) != 2 || client.events[0].props["all"] != true || client.events[1].props["all"] != true {
		t.Fatalf("all events = %#v", client.events)
	}
}

func TestDevEnvSyncNotRunningUsesNodeEvent(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	client := &devEnvEventClient{}
	old := GetConfig()
	SetConfig(Config{Tracker: &telemetry.Tracker{Clients: []telemetry.Client{client}}})
	t.Cleanup(func() { SetConfig(old) })

	root := &cobra.Command{Use: "dev-env"}
	sync := &cobra.Command{Use: "sync"}
	sql := &cobra.Command{Use: "sql", RunE: func(cmd *cobra.Command, _ []string) error {
		devEnvTrackingBegin(cmd, map[string]any{"slug": "example-site", "app": 123, "env": "develop", "multisite": false})
		return devenv.ErrEnvironmentNotStarted
	}}
	sync.AddCommand(sql)
	root.AddCommand(sync)
	installDevEnvTelemetry(root)
	root.SetArgs([]string{"sync", "sql"})
	if err := root.Execute(); !errors.Is(err, devenv.ErrEnvironmentNotStarted) {
		t.Fatalf("got error %v", err)
	}
	if len(client.events) != 2 || client.events[1].name != "dev_env_sync_sql_command_env_not_running_error" || client.events[1].props["errorMessage"] != "Environment was not running" {
		t.Fatalf("sync events = %#v", client.events)
	}
}

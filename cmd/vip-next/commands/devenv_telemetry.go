package commands

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/devenv/paths"
	"github.com/Automattic/vip/internal/searchreplace"
	"github.com/Automattic/vip/internal/telemetry"
	"github.com/spf13/cobra"
)

type devEnvTelemetryKey struct{}

type devEnvTelemetryState struct {
	name     string
	args     []string
	info     map[string]any
	started  time.Time
	canceled bool
}

var devEnvEventNames = map[string]string{
	"create": "dev_env_create_command_", "start": "dev_env_start_command_",
	"stop": "dev_env_stop_command_", "destroy": "dev_env_destroy_command_",
	"info": "dev_env_info_command_", "list": "dev_env_list_command_",
	"purge": "dev_env_purge_command_", "update": "dev_env_update_command_",
	"exec": "dev_env_exec_command_", "shell": "dev_env_shell_command_",
	"logs": "dev_env_logs_command_", "import sql": "dev_env_import_sql_command_",
	"import media": "dev_env_import_media_command_", "sync sql": "dev_env_sync_sql_command_",
	"envvar get": "dev_env_envvar_get_command_", "envvar get-all": "dev_env_envvar_get_all_command_",
	"envvar list": "dev_env_envvar_list_command_", "envvar set": "dev_env_envvar_set_command_",
	"envvar delete": "dev_env_envvar_delete_command_",
}

// installDevEnvTelemetry wraps leaves after their middleware is built. Slug
// commands emit execute from ResolveSlug, after resolution as Node does.
func installDevEnvTelemetry(root *cobra.Command) {
	var visit func(*cobra.Command, string)
	visit = func(parent *cobra.Command, prefix string) {
		for _, child := range parent.Commands() {
			path := strings.TrimSpace(prefix + " " + child.Name())
			if child.RunE != nil {
				if name, ok := devEnvEventNames[path]; ok {
					original := child.RunE
					child.RunE = func(cmd *cobra.Command, args []string) error {
						state := &devEnvTelemetryState{name: name, args: args}
						ctx := cmd.Context()
						if ctx == nil {
							ctx = context.Background()
						}
						cmd.SetContext(context.WithValue(ctx, devEnvTelemetryKey{}, state))
						if path == "list" || ((path == "info" || path == "stop") && devEnvAllFlag(cmd)) {
							devEnvTrackingBegin(cmd, map[string]any{"all": true})
						}
						err := original(cmd, args)
						if state.started.IsZero() || state.canceled {
							return err
						}
						if err != nil {
							if path == "sync sql" && errors.Is(err, devenv.ErrEnvironmentNotStarted) {
								props := devEnvTrackingCopy(state.info)
								props["errorMessage"] = "Environment was not running"
								trackEvent(name+"env_not_running_error", props)
								return err
							}
							props := devEnvTrackingCopy(state.info)
							props["failure"] = telemetry.ScrubErrorText(err.Error())
							trackEvent(name+"error", props)
							return err
						}
						props := devEnvTrackingCopy(state.info)
						if path == "start" {
							props["processing_time"] = int64(math.Ceil(time.Since(state.started).Seconds()))
						}
						trackEvent(name+"success", props)
						return nil
					}
				}
			}
			visit(child, path)
		}
	}
	visit(root, "")
}

func devEnvAllFlag(cmd *cobra.Command) bool {
	if cmd.Flags().Lookup("all") == nil {
		return false
	}
	all, _ := cmd.Flags().GetBool("all")
	return all
}

func devEnvTrackingCopy(info map[string]any) map[string]any {
	copyInfo := make(map[string]any, len(info))
	for k, v := range info {
		copyInfo[k] = v
	}
	return copyInfo
}

func devEnvTrackingState(cmd *cobra.Command) *devEnvTelemetryState {
	ctx := cmd.Context()
	if ctx == nil {
		return nil
	}
	state, _ := ctx.Value(devEnvTelemetryKey{}).(*devEnvTelemetryState)
	return state
}

func devEnvTrackingBegin(cmd *cobra.Command, info map[string]any) {
	state := devEnvTrackingState(cmd)
	if state == nil || !state.started.IsZero() {
		return
	}
	state.info = devEnvTrackingCopy(info)
	state.started = time.Now()
	trackEvent(state.name+"execute", devEnvTrackingCopy(state.info))
}

func devEnvTrackingResolved(cmd *cobra.Command, slug string) {
	state := devEnvTrackingState(cmd)
	if state == nil {
		return
	}
	info := devEnvTrackingInfo(slug)
	if cmd.Name() == "sql" && cmd.Parent() != nil && cmd.Parent().Name() == "import" {
		if len(state.args) > 0 {
			details, err := searchreplace.GetSqlDumpDetails(state.args[0])
			if err != nil {
				return // Node determines dump type before its execute event.
			}
			info["sqldump_type"] = string(details.Type)
		}
	}
	if cmd.Name() == "sql" && cmd.Parent() != nil && cmd.Parent().Name() == "sync" {
		if ae := appctx.FromContext(cmd.Context()); ae != nil {
			info = map[string]any{
				"app": ae.App.ID, "env": ae.Env.UniqueLabel,
				"slug": slug, "multisite": ae.Env.IsMultisite,
			}
		}
	}
	if cmd.Name() == "start" {
		editor, _ := cmd.Flags().GetString("editor")
		vscode, _ := cmd.Flags().GetBool("vscode")
		if editor == "" && vscode {
			editor = "vscode"
		}
		if editor != "" {
			info["editor"] = editor
		}
		info["vscode"] = vscode
		versions := (&dockercli.Runner{}).Versions(cmd.Context())
		info["docker"] = versions.Engine
		info["docker_compose"] = versions.Compose
		info["compose_plugin"] = versions.ComposePlugin
	}
	devEnvTrackingBegin(cmd, info)
}

func devEnvTrackingCreate(cmd *cobra.Command, slug string) {
	info := map[string]any{"slug": slug}
	if app, _ := cmd.Flags().GetString("app"); app != "" {
		info["app"] = app
	}
	if env, _ := cmd.Flags().GetString("env"); env != "" {
		info["env"] = env
	}
	devEnvTrackingBegin(cmd, info)
}

func devEnvTrackingCancelled(cmd *cobra.Command) {
	state := devEnvTrackingState(cmd)
	if state != nil {
		state.canceled = true
	}
}

func devEnvTrackingSpecial(cmd *cobra.Command, name string) {
	state := devEnvTrackingState(cmd)
	if state != nil && !state.started.IsZero() {
		trackEvent(name, devEnvTrackingCopy(state.info))
	}
}

// devEnvTrackingInfo mirrors Node's getEnvTrackingInfo for the shared instance
// fields. Only known Node fields are eligible: Go also stores user environment
// variables and volume metadata in instance_data.json, neither of which belongs
// in telemetry. Local login credentials are excluded in both runtimes.
func devEnvTrackingInfo(slug string) map[string]any {
	info := map[string]any{"slug": slug}
	data, err := os.ReadFile(filepath.Join(paths.EnvironmentPath(slug), "instance_data.json"))
	if err != nil {
		return info
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return info
	}
	// Node's readEnvironmentData maps these legacy names before tracking.
	if legacy, ok := fields["clientCode"]; ok && string(legacy) != "null" {
		fields["appCode"] = legacy
	}
	for _, legacyKey := range []string{"enterpriseSearchEnabled", "elasticsearchEnabled"} {
		if legacy, ok := fields[legacyKey]; ok && string(legacy) == "true" {
			fields["elasticsearch"] = legacy
			break
		}
	}
	for _, key := range []string{
		"siteSlug", "wpTitle", "multisite", "wordpress", "muPlugins", "appCode",
		"mediaRedirectDomain", "phpmyadmin", "xdebug", "xdebugConfig", "mariadb",
		"php", "elasticsearch", "mailpit", "photon", "cron", "pullAfter",
		"version",
	} {
		raw, ok := fields[key]
		if !ok {
			continue
		}
		var value any
		if key == "wordpress" || key == "muPlugins" || key == "appCode" {
			var compact bytes.Buffer
			if err := json.Compact(&compact, raw); err != nil {
				continue
			}
			value = compact.String()
		} else if err := json.Unmarshal(raw, &value); err != nil {
			continue
		}
		if key == "php" {
			if php, ok := value.(string); ok {
				if colon := strings.IndexByte(php, ':'); colon >= 0 {
					value = php[colon+1:]
				}
			}
		}
		info[devEnvSnakeCase(key)] = value
	}
	return info
}

func devEnvSnakeCase(key string) string {
	var b strings.Builder
	for _, r := range key {
		if r >= 'A' && r <= 'Z' {
			b.WriteByte('_')
			b.WriteRune(r + ('a' - 'A'))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

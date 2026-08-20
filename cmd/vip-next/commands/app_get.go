package commands

import (
	"fmt"
	"reflect"
	"strconv"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/output"
)

// AppGetCmd is a non-registered cobra command that exists to document the
// `vip app <name>` form. Its execution path runs through
// appctx.WithWildcardCommand on the `vip app` parent (wired in root.go), not
// through the cobra dispatch tree. We keep this factory so help text + the
// --format flag are bound somewhere accessible for unit tests; production
// `--format` lives on the appCmd parent (see AppCmd).
func AppGetCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "<name>",
		Short: "Get application info",
		Long:  "Retrieve information about an application and its environments.",
	}
	// --format lives here for unit tests; in production the parent AppCmd owns it
	// (the wildcard dispatcher reads flags from the parent, not this stub command).
	cmd.Flags().StringP("format", "f", "table",
		"Render output in a particular format. Accepts \"table\" (default), \"csv\", \"json\".")
	return cmd
}

// RunAppGet is the wildcard dispatcher target. Wired by root.go via
// appctx.WithWildcardCommand(appCmd, commands.RunAppGet).
//
// Behaviorally mirrors Node's vip-app.js: not-found and fetch-error paths
// print to stdout and exit 0; numeric arg → app(id:); non-numeric → apps(name:).
func RunAppGet(cmd *cobra.Command, args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("Please supply 1 argument: %s <name>", cmd.UseLine())
	}
	data, err := runAppGet(cmd, args)
	if err != nil {
		return err
	}
	f, _ := cmd.Flags().GetString("format")
	if f == "" {
		f = "table"
	}
	allowed := map[string]bool{"table": true, "csv": true, "json": true}
	if !allowed[f] {
		return fmt.Errorf("Invalid format: %s. The supported formats are: table, csv, json.", f)
	}
	if data == nil {
		return nil
	}
	cfg := GetConfig()
	if cfg.Tracker != nil {
		cfg.Tracker.TrackEvent("app_command_success", nil)
	}
	return output.Render(cmd.OutOrStdout(), output.Format(f), data)
}

func runAppGet(cmd *cobra.Command, args []string) (any, error) {
	cfg := GetConfig()
	key := args[0]
	if cfg.Tracker != nil {
		cfg.Tracker.TrackEvent("app_command_execute", nil)
	}

	if id, err := strconv.ParseInt(key, 10, 64); err == nil {
		resp, qerr := gql.AppGetByID(cmd.Context(), cfg.GQLClient, id)
		if qerr != nil {
			fmt.Fprintf(cmd.OutOrStdout(), "Unable to locate app %s: %s\n", key, qerr.Error())
			if cfg.Tracker != nil {
				cfg.Tracker.TrackEvent("app_command_fetch_error", map[string]any{"error": qerr.Error()})
			}
			return nil, nil
		}
		// Node parity: `! res.environments` triggers not-found, but `[]`
		// passes (JS: `![] === false`). nil slice == undefined; empty slice
		// renders an empty env table.
		if resp == nil || resp.App == nil || resp.App.Environments == nil {
			fmt.Fprintf(cmd.OutOrStdout(), "App %s was not found\n", key)
			if cfg.Tracker != nil {
				cfg.Tracker.TrackEvent("app_command_fetch_error",
					map[string]any{"error": fmt.Sprintf("App %s does not exist", key)})
			}
			return nil, nil
		}
		return buildAppGetOutput(resp.App.Environments), nil
	}

	resp, err := gql.AppGetByName(cmd.Context(), cfg.GQLClient, key)
	if err != nil {
		fmt.Fprintf(cmd.OutOrStdout(), "Unable to locate app %s: %s\n", key, err.Error())
		if cfg.Tracker != nil {
			cfg.Tracker.TrackEvent("app_command_fetch_error", map[string]any{"error": err.Error()})
		}
		return nil, nil
	}
	if resp == nil || resp.Apps == nil || len(resp.Apps.Edges) == 0 || resp.Apps.Edges[0] == nil {
		fmt.Fprintf(cmd.OutOrStdout(), "App %s was not found\n", key)
		if cfg.Tracker != nil {
			cfg.Tracker.TrackEvent("app_command_fetch_error",
				map[string]any{"error": fmt.Sprintf("App %s does not exist", key)})
		}
		return nil, nil
	}
	edge := resp.Apps.Edges[0]
	if edge.Environments == nil {
		// Node parity: same `! res.environments` short-circuit as the byID
		// path. nil slice == undefined.
		fmt.Fprintf(cmd.OutOrStdout(), "App %s was not found\n", key)
		if cfg.Tracker != nil {
			cfg.Tracker.TrackEvent("app_command_fetch_error",
				map[string]any{"error": fmt.Sprintf("App %s does not exist", key)})
		}
		return nil, nil
	}
	return buildAppGetOutput(edge.Environments), nil
}

// buildAppGetOutput accepts an envs slice (the concrete type varies per query,
// hence reflectSliceToSlice) and returns only the environment rows. Node's
// vip-app.js does not return an app-level header. The rows omit
// deploymentStrategy and flatten primaryDomain to a string.
func buildAppGetOutput(envs any) output.OrderedRows {
	rows := output.OrderedRows{}
	for _, raw := range reflectSliceToSlice(envs) {
		e := readEnvFieldsForAppGet(raw)
		commit := e.currentCommit
		if len(commit) > 7 {
			commit = commit[:7]
		}
		branch := e.branch
		if e.deploymentStrategy == "custom-deploy" {
			branch = "-"
		}
		// getEnvIdentifier(env): "type" for the main env (where env.appId ==
		// env.id), else "type.name". See Node src/lib/cli/command.js.
		identifier := e.type_
		if e.name != "" && e.name != e.type_ && e.appId != e.id {
			identifier = e.type_ + "." + e.name
		}
		rows = append(rows, output.OrderedRow{
			{Key: "id", Value: e.id},
			{Key: "appId", Value: e.appId},
			{Key: "name", Value: identifier},
			{Key: "type", Value: e.type_},
			{Key: "branch", Value: branch},
			{Key: "currentCommit", Value: commit},
			{Key: "primaryDomain", Value: e.primaryDomain},
			{Key: "launched", Value: e.launched},
		})
	}
	return rows
}

type appGetEnvFields struct {
	id                 int64
	appId              int64
	name               string
	type_              string
	branch             string
	currentCommit      string
	primaryDomain      string
	launched           bool
	deploymentStrategy string
}

func reflectSliceToSlice(v any) []any {
	rv := reflect.ValueOf(v)
	if !rv.IsValid() || rv.Kind() != reflect.Slice {
		return nil
	}
	out := make([]any, 0, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		out = append(out, rv.Index(i).Interface())
	}
	return out
}

func readEnvFieldsForAppGet(v any) appGetEnvFields {
	rv := reflect.ValueOf(v)
	for rv.Kind() == reflect.Ptr {
		if rv.IsNil() {
			return appGetEnvFields{}
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return appGetEnvFields{}
	}
	var f appGetEnvFields
	if v := derefFieldInt64(rv, "Id"); v != nil {
		f.id = *v
	}
	if v := derefFieldInt64(rv, "AppId"); v != nil {
		f.appId = *v
	}
	if v := derefFieldString(rv, "Name"); v != nil {
		f.name = *v
	}
	if v := derefFieldString(rv, "Type"); v != nil {
		f.type_ = *v
	}
	if v := derefFieldString(rv, "Branch"); v != nil {
		f.branch = *v
	}
	if v := derefFieldString(rv, "CurrentCommit"); v != nil {
		f.currentCommit = *v
	}
	if v := derefFieldString(rv, "DeploymentStrategy"); v != nil {
		f.deploymentStrategy = *v
	}
	if v := derefFieldBool(rv, "Launched"); v != nil {
		f.launched = *v
	}
	if pd := rv.FieldByName("PrimaryDomain"); pd.IsValid() {
		// PrimaryDomain is a pointer to a per-query Domain struct with a
		// (non-nullable) string Name field.
		for pd.Kind() == reflect.Ptr {
			if pd.IsNil() {
				break
			}
			pd = pd.Elem()
		}
		if pd.Kind() == reflect.Struct {
			if v := derefFieldString(pd, "Name"); v != nil {
				f.primaryDomain = *v
			}
		}
	}
	return f
}

func derefFieldInt64(rv reflect.Value, name string) *int64 {
	f := rv.FieldByName(name)
	if !f.IsValid() {
		return nil
	}
	if f.Kind() == reflect.Ptr {
		if f.IsNil() {
			return nil
		}
		v := f.Elem().Int()
		return &v
	}
	if f.Kind() == reflect.Int || f.Kind() == reflect.Int64 || f.Kind() == reflect.Int32 {
		v := f.Int()
		return &v
	}
	return nil
}

func derefFieldString(rv reflect.Value, name string) *string {
	f := rv.FieldByName(name)
	if !f.IsValid() {
		return nil
	}
	if f.Kind() == reflect.Ptr {
		if f.IsNil() {
			return nil
		}
		v := f.Elem().String()
		return &v
	}
	if f.Kind() == reflect.String {
		v := f.String()
		return &v
	}
	return nil
}

func derefFieldBool(rv reflect.Value, name string) *bool {
	f := rv.FieldByName(name)
	if !f.IsValid() {
		return nil
	}
	if f.Kind() == reflect.Ptr {
		if f.IsNil() {
			return nil
		}
		v := f.Elem().Bool()
		return &v
	}
	if f.Kind() == reflect.Bool {
		v := f.Bool()
		return &v
	}
	return nil
}

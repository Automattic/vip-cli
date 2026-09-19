// Package envvar wraps the GetEnvironmentVariables and
// GetEnvironmentVariablesWithValues genqlient operations behind a stable
// Go-friendly surface.
//
// The schema exposes only two operations — list names and list with values —
// so there is no server-side single-name fetch. Node's `vip config envvar get
// <NAME>` filters client-side from the get-all result; we mirror that.
//
// The two operations have distinct genqlient response types (different
// concrete types per query), so we walk both via reflection to a single
// flat slice. See Node parity sources: src/lib/envvar/api-list.ts,
// api-get.ts, api-get-all.ts.
package envvar

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"regexp"
	"strings"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/gql"
)

// NewRelicKey is the protected variable name. Node parity:
// src/bin/vip-config-envvar-set.js refuses to set it because the platform
// owns the value. Compared against the uppercased name (the handler
// uppercases before this check, mirroring Node).
const NewRelicKey = "NEW_RELIC_LICENSE_KEY"

// validNameRe matches Node's effective `validateName` regex from
// src/lib/envvar/api.ts: trim+uppercase+strip non-[A-Z0-9_], then require
// the original to round-trip AND start with [A-Z]. Underscore-leading
// names are rejected (e.g. "_FOO") — Node parity.
var validNameRe = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)

// ErrInvalidName is the user-facing error returned by ValidateName.
// The message text matches Node's (modulo color) so parity scenarios can
// assert against substrings.
var ErrInvalidName = errors.New("Environment variable name must consist of A-Z, 0-9, or _,\nand must start with an uppercase letter.")

// ValidateName returns nil if name matches Node's validation, otherwise
// ErrInvalidName. Empty is a special-case "name cannot be empty" error.
// Callers should uppercase + trim BEFORE calling — this function does not
// normalize on its own (matches Node where the uppercase is done in the
// command handler, then validateName runs against the result).
func ValidateName(name string) error {
	if name == "" {
		return errors.New("Environment variable name cannot be empty")
	}
	if !validNameRe.MatchString(name) {
		return ErrInvalidName
	}
	return nil
}

// Set adds or updates an environment variable. Node parity: api-set.ts
// calls ONLY addEnvironmentVariable — the server does upsert internally.
// We do the same. reloadManifest=false in current parity scenarios; the
// follow-up prompt is deferred (see config_envvar_set.go scope note).
func Set(ctx context.Context, c graphql.Client, appID, envID int64, name, value string, reloadManifest bool) error {
	input := &gql.EnvironmentVariableInput{
		ApplicationId:  appID,
		EnvironmentId:  envID,
		Name:           name,
		Value:          value,
		ReloadManifest: &reloadManifest,
	}
	_, err := gql.AddEnvironmentVariable(ctx, c, input)
	return err
}

// Delete removes an environment variable. Node parity: api-delete.ts sends
// value: "" (empty string, NOT omitted) on the input — the schema marks
// Value as required even on delete.
func Delete(ctx context.Context, c graphql.Client, appID, envID int64, name string, reloadManifest bool) error {
	input := &gql.EnvironmentVariableInput{
		ApplicationId:  appID,
		EnvironmentId:  envID,
		Name:           name,
		Value:          "",
		ReloadManifest: &reloadManifest,
	}
	_, err := gql.DeleteEnvironmentVariable(ctx, c, input)
	return err
}

// ReadFromFile reads the file at path and returns its content with
// leading + trailing whitespace stripped (Node parity: src/lib/read-file.ts
// does `data.trim()` — full TrimSpace, NOT just TrimRight). Internal
// whitespace is preserved.
func ReadFromFile(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", path, err)
	}
	return strings.TrimSpace(string(b)), nil
}

// EnvVar is a flat name/value pair. Empty Value distinguishes the
// list-of-names path from the with-values path at the type level.
type EnvVar struct {
	Name  string
	Value string
}

// List returns the names (only) of environment variables on the env. Empty
// slice is a valid result (no env vars set). Network/schema errors propagate.
func List(ctx context.Context, c graphql.Client, appID, envID int64) ([]string, error) {
	resp, err := gql.GetEnvironmentVariables(ctx, c, appID, envID)
	if err != nil {
		return nil, err
	}
	nodes := walkEnvVarNodes(resp)
	out := make([]string, 0, len(nodes))
	for _, n := range nodes {
		out = append(out, n.Name)
	}
	return out, nil
}

// Get returns the EnvVar matching name, or nil if not present. Implements
// single-fetch client-side (the schema has no per-name query). Node parity:
// src/lib/envvar/api-get.ts.
func Get(ctx context.Context, c graphql.Client, appID, envID int64, name string) (*EnvVar, error) {
	vars, err := GetAll(ctx, c, appID, envID)
	if err != nil {
		return nil, err
	}
	for i := range vars {
		if vars[i].Name == name {
			return &vars[i], nil
		}
	}
	return nil, nil
}

// GetAll returns every environment variable with its value.
func GetAll(ctx context.Context, c graphql.Client, appID, envID int64) ([]EnvVar, error) {
	resp, err := gql.GetEnvironmentVariablesWithValues(ctx, c, appID, envID)
	if err != nil {
		return nil, err
	}
	nodes := walkEnvVarNodes(resp)
	out := make([]EnvVar, 0, len(nodes))
	for _, n := range nodes {
		out = append(out, EnvVar{Name: n.Name, Value: n.Value})
	}
	return out, nil
}

// envVarNode is a flat per-node view extracted via reflection.
type envVarNode struct {
	Name  string
	Value string
}

// walkEnvVarNodes accepts either GetEnvironmentVariablesResponse or
// GetEnvironmentVariablesWithValuesResponse (distinct genqlient concrete
// types) and yields a flat slice. The Value field is empty when the
// underlying response omits it (list-of-names query).
func walkEnvVarNodes(v any) []envVarNode {
	out := []envVarNode{}
	rv := reflect.ValueOf(v)
	for rv.Kind() == reflect.Ptr {
		if rv.IsNil() {
			return out
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return out
	}
	// Navigate: resp.App -> envs[0] -> EnvironmentVariables -> Nodes
	app := rv.FieldByName("App")
	for app.Kind() == reflect.Ptr {
		if app.IsNil() {
			return out
		}
		app = app.Elem()
	}
	if !app.IsValid() || app.Kind() != reflect.Struct {
		return out
	}
	envs := app.FieldByName("Environments")
	if !envs.IsValid() || envs.Kind() != reflect.Slice || envs.Len() == 0 {
		return out
	}
	env := envs.Index(0)
	for env.Kind() == reflect.Ptr {
		if env.IsNil() {
			return out
		}
		env = env.Elem()
	}
	if env.Kind() != reflect.Struct {
		return out
	}
	ev := env.FieldByName("EnvironmentVariables")
	for ev.Kind() == reflect.Ptr {
		if ev.IsNil() {
			return out
		}
		ev = ev.Elem()
	}
	if !ev.IsValid() || ev.Kind() != reflect.Struct {
		return out
	}
	nodes := ev.FieldByName("Nodes")
	if !nodes.IsValid() || nodes.Kind() != reflect.Slice {
		return out
	}
	for i := 0; i < nodes.Len(); i++ {
		n := nodes.Index(i)
		for n.Kind() == reflect.Ptr {
			if n.IsNil() {
				n = reflect.Value{}
				break
			}
			n = n.Elem()
		}
		if !n.IsValid() || n.Kind() != reflect.Struct {
			continue
		}
		var item envVarNode
		if f := n.FieldByName("Name"); f.IsValid() {
			switch f.Kind() {
			case reflect.Ptr:
				if !f.IsNil() {
					item.Name = f.Elem().String()
				}
			case reflect.String:
				item.Name = f.String()
			}
		}
		if f := n.FieldByName("Value"); f.IsValid() {
			switch f.Kind() {
			case reflect.Ptr:
				if !f.IsNil() {
					item.Value = f.Elem().String()
				}
			case reflect.String:
				item.Value = f.String()
			}
		}
		out = append(out, item)
	}
	return out
}

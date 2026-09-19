package commands

import (
	"errors"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/output"
	"github.com/Automattic/vip/internal/softwaresettings"
)

// ConfigSoftwareCmd returns the `vip config software` parent. Subcommands
// (`get` now, `update` in Task 7) are attached here.
func ConfigSoftwareCmd() *cobra.Command {
	parent := &cobra.Command{
		Use:   "software",
		Short: "Manage software settings for an environment",
		Long:  "Manage software settings (WordPress, PHP, Node.js, MU Plugins) for a VIP Platform environment.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}
	parent.AddCommand(ConfigSoftwareGetCmd())
	parent.AddCommand(ConfigSoftwareUpdateCmd())
	return parent
}

// ConfigSoftwareGetCmd returns the `vip config software get` leaf command.
func ConfigSoftwareGetCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "get [wordpress|php|nodejs|muplugins]",
		Short: "Retrieve software settings for an environment",
		Long: "Retrieve software settings for a VIP Platform environment. " +
			"Optionally filter to a single component by passing its slug as a positional argument.",
		Args: cobra.MaximumNArgs(1),
	}
	// Register --include before buildAppEnvRenderableCmd wraps the cmd so
	// cobra can parse it before RunE fires.
	cmd.Flags().StringP("format", "f", "table",
		"Render output in a particular format.")
	cmd.Flags().StringArrayP("include", "i",
		nil,
		`Retrieve additional data of a specific type. Supported values: available_versions`)
	return buildAppEnvRenderableCmd(cmd, "table", []string{"table", "csv", "json"}, runConfigSoftwareGet)
}

// validIncludes is the set of --include values accepted by `config software get`.
var validIncludes = map[string]bool{
	"available_versions": true,
}

func runConfigSoftwareGet(cmd *cobra.Command, args []string) (any, error) {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return nil, errors.New("appctx not set; this is a wiring bug")
	}

	cfg := GetConfig()
	trackEvent("config_software_get_execute", map[string]any{"args": args})

	// Validate --include values before hitting the network.
	includes, _ := cmd.Flags().GetStringArray("include")
	var invalid []string
	for _, inc := range includes {
		if !validIncludes[inc] {
			invalid = append(invalid, inc)
		}
	}
	if len(invalid) > 0 {
		return nil, errors.New("Invalid include value(s): " + strings.Join(invalid, ","))
	}

	// Fetch software settings from GraphQL.
	resp, err := gql.SoftwareSettings(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID)
	if err != nil {
		return nil, err
	}

	// Navigate to the environment's softwareSettings.
	if resp.App == nil || len(resp.App.Environments) == 0 {
		return nil, errors.New("Software settings are not supported for this environment.")
	}
	env := resp.App.Environments[0]
	ss := env.SoftwareSettings
	if ss == nil {
		return nil, errors.New("Software settings are not supported for this environment.")
	}

	// Determine which components to render. Node's order: wordpress, php,
	// muplugins, nodejs (vip-config-software-get.js:95-100).
	type entry struct {
		slug string
		node gqlSoftwareNode
	}
	allComponents := []entry{
		{"wordpress", gqlNodeFrom(ss.Wordpress)},
		{"php", gqlNodeFrom(ss.Php)},
		{"muplugins", gqlNodeFrom(ss.Muplugins)},
		{"nodejs", gqlNodeFrom(ss.Nodejs)},
	}

	var chosen []entry
	if len(args) > 0 {
		component := args[0]
		var found *entry
		for _, e := range allComponents {
			if e.slug == component && e.node != nil {
				e := e
				found = &e
				break
			}
		}
		if found == nil {
			return nil, errors.New("Software settings for " + component + " are not supported for this environment.")
		}
		chosen = []entry{*found}
	} else {
		for _, e := range allComponents {
			if e.node != nil {
				chosen = append(chosen, e)
			}
		}
	}

	// Determine output format from the --format flag (set by WithFormat).
	format, _ := cmd.Flags().GetString("format")

	// Build output rows.
	var rows output.OrderedRows
	for _, e := range chosen {
		sw := gqlNodeToSoftware(e.node)
		var row softwaresettings.FormattedRow
		if format == "json" {
			row = softwaresettings.FormatSettingJSON(sw, includes)
		} else {
			row = softwaresettings.FormatSetting(sw, includes, format)
		}
		orderedRow := output.OrderedRow{
			{Key: "name", Value: row.Name},
			{Key: "slug", Value: row.Slug},
			{Key: "version", Value: row.Version},
		}
		if row.AvailableVersions != nil {
			orderedRow = append(orderedRow, output.Cell{Key: "available_versions", Value: row.AvailableVersions})
		}
		rows = append(rows, orderedRow)
	}

	trackEvent("config_software_get_success", map[string]any{"args": args})
	return rows, nil
}

// gqlSoftwareNode is an interface satisfied by all four generated software
// setting types (wordpress/php/muplugins/nodejs). It mirrors the SoftwareNode
// embedded fragment accessors.
type gqlSoftwareNode interface {
	GetName() string
	GetSlug() string
	GetPinned() bool
	GetCurrent() *gql.SoftwareNodeCurrentAppEnvironmentSoftwareSettingsVersion
	GetOptions() []*gql.SoftwareNodeOptionsAppEnvironmentSoftwareSettingsVersion
}

// gqlNodeFrom coerces a concrete type to the interface. Returns nil when the
// argument is nil (genqlient pointer receivers are safe to call on nil, but
// the interface assertion for nil-pointer is non-nil, so we check explicitly).
func gqlNodeFrom[T gqlSoftwareNode](v T) gqlSoftwareNode {
	// A nil pointer stored in a concrete type satisfies the interface as
	// non-nil. We detect that case by checking whether the pointer value is
	// actually zero.
	if any(v) == nil {
		return nil
	}
	// Use reflect-free nil check via the any→pointer trick.
	type nilChecker interface{ GetName() string }
	// All gqlSoftwareNode implementations are pointers; if the underlying
	// pointer is nil, GetName would panic. Use a type-switch nil check.
	switch t := any(v).(type) {
	case *gql.SoftwareSettingsAppEnvironmentsAppEnvironmentSoftwareSettingsWordpressAppEnvironmentSoftwareSettingsSoftware:
		if t == nil {
			return nil
		}
	case *gql.SoftwareSettingsAppEnvironmentsAppEnvironmentSoftwareSettingsPhpAppEnvironmentSoftwareSettingsSoftware:
		if t == nil {
			return nil
		}
	case *gql.SoftwareSettingsAppEnvironmentsAppEnvironmentSoftwareSettingsMupluginsAppEnvironmentSoftwareSettingsSoftware:
		if t == nil {
			return nil
		}
	case *gql.SoftwareSettingsAppEnvironmentsAppEnvironmentSoftwareSettingsNodejsAppEnvironmentSoftwareSettingsSoftware:
		if t == nil {
			return nil
		}
	}
	return v
}

// gqlNodeToSoftware converts a gqlSoftwareNode to the pure-logic Software type.
func gqlNodeToSoftware(n gqlSoftwareNode) softwaresettings.Software {
	sw := softwaresettings.Software{
		Name:   n.GetName(),
		Slug:   n.GetSlug(),
		Pinned: n.GetPinned(),
	}
	if cur := n.GetCurrent(); cur != nil {
		sw.Current = softwaresettings.Version{
			Version:    cur.Version,
			Default:    cur.Default,
			Deprecated: cur.Deprecated,
			Unstable:   cur.Unstable,
		}
	}
	for _, opt := range n.GetOptions() {
		if opt == nil {
			continue
		}
		sw.Options = append(sw.Options, softwaresettings.Version{
			Version:    opt.Version,
			Default:    opt.Default,
			Deprecated: opt.Deprecated,
			Unstable:   opt.Unstable,
		})
	}
	return sw
}

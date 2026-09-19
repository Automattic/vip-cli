// Package softwaresettings contains pure formatting logic for `vip config
// software get` output. It is decoupled from cobra so it can be unit-tested
// without bringing in the full command tree.
package softwaresettings

import (
	"sort"
	"strings"
)

// ManagedOptionKey is the sentinel value for WordPress managed updates.
const ManagedOptionKey = "managed_latest"

// Version is an available or current software version entry.
type Version struct {
	Version    string
	Default    bool
	Deprecated bool
	Unstable   bool
}

// Software holds all settings for one software component.
type Software struct {
	Name, Slug string
	Pinned     bool
	Current    Version
	Options    []Version
}

// FormattedRow is one row of `config software get` output.
type FormattedRow struct {
	Name              string
	Slug              string
	Version           string
	AvailableVersions any // string (non-JSON, sorted+joined) or []string (JSON)
}

// allOptionValues ports Node's _optionsForVersion (software.ts:167-208).
// The returned order is Node's allOptions array:
//
//	managed (wordpress only) → supported (option-array order) → test
//	(unstable) → deprecated
//
// Node keeps deprecated entries in this list; it is the DISPLAY path
// (formatSoftwareSettings, software.ts:439 `.filter(option =>
// !option.deprecated)`) that removes them, not the validation path.
func allOptionValues(s Software) []string {
	var supported, test, deprecated []string
	for _, o := range s.Options {
		switch {
		case o.Deprecated:
			deprecated = append(deprecated, o.Version)
		case o.Unstable:
			test = append(test, o.Version)
		default:
			supported = append(supported, o.Version)
		}
	}
	var out []string
	if s.Slug == "wordpress" {
		out = append(out, ManagedOptionKey)
	}
	out = append(out, supported...)
	out = append(out, test...)
	out = append(out, deprecated...)
	return out
}

// optionValues is the DISPLAY subset: allOptionValues minus deprecated,
// matching formatSoftwareSettings' filter (software.ts:439).
func optionValues(s Software) []string {
	deprecated := make(map[string]bool, len(s.Options))
	for _, o := range s.Options {
		if o.Deprecated {
			deprecated[o.Version] = true
		}
	}
	all := allOptionValues(s)
	out := make([]string, 0, len(all))
	for _, v := range all {
		if !deprecated[v] {
			out = append(out, v)
		}
	}
	return out
}

func baseRow(s Software) FormattedRow {
	version := s.Current.Version
	if s.Slug == "wordpress" && !s.Pinned {
		version += " (managed updates)" // software.ts:428-430
	}
	return FormattedRow{Name: s.Name, Slug: s.Slug, Version: version}
}

// FormatSetting formats for non-JSON output (available_versions sorted + comma-joined).
func FormatSetting(s Software, includes []string, _ string) FormattedRow {
	r := baseRow(s)
	if contains(includes, "available_versions") {
		vals := optionValues(s)
		sort.Strings(vals)
		r.AvailableVersions = strings.Join(vals, ",")
	}
	return r
}

// FormatSettingJSON formats for JSON output (available_versions as unsorted []string).
func FormatSettingJSON(s Software, includes []string) FormattedRow {
	r := baseRow(s)
	if contains(includes, "available_versions") {
		r.AvailableVersions = optionValues(s)
	}
	return r
}

func contains(ss []string, v string) bool {
	for _, s := range ss {
		if s == v {
			return true
		}
	}
	return false
}

// componentNames maps slug → display name, mirroring Node's
// getComponentDisplayName (software.ts).
var componentNames = map[string]string{
	"wordpress": "WordPress",
	"php":       "PHP",
	"muplugins": "MU Plugins",
	"nodejs":    "Node.js",
}

// ComponentDisplayName returns the human-readable name for a component slug.
func ComponentDisplayName(slug string) string { return componentNames[slug] }

// ValidComponents mirrors _processComponent (software.ts:225): WordPress app
// types {2,6} → wordpress,php,muplugins ; Node.js {3,5,7,8} → nodejs.
func ValidComponents(appTypeID int64) []string {
	switch appTypeID {
	case 2, 6:
		return []string{"wordpress", "php", "muplugins"}
	case 3, 5, 7, 8:
		return []string{"nodejs"}
	default:
		return nil
	}
}

// ValidationError carries a Node-parity user-facing message.
type ValidationError struct{ Msg string }

func (e *ValidationError) Error() string { return e.Msg }

// ResolveComponent validates a user-provided component against the app type.
func ResolveComponent(appTypeID int64, component string) (string, error) {
	valid := ValidComponents(appTypeID)
	if len(valid) == 0 {
		return "", &ValidationError{"No components are supported for this application"}
	}
	if component == "" {
		if len(valid) == 1 {
			return valid[0], nil
		}
		return "", &ValidationError{"Please specify a component: " + strings.Join(valid, ",")}
	}
	if !contains(valid, component) {
		return "", &ValidationError{"Component " + component + " is not supported. Use one of: " + strings.Join(valid, ",")}
	}
	return component, nil
}

// AllowedVersions returns the version values shown by `config software get`
// (deprecated excluded, per software.ts:439).
func AllowedVersions(s Software) []string { return optionValues(s) }

// UpdatableVersions returns the versions `config software update` accepts —
// Node's _optionsForVersion values, deprecated INCLUDED (software.ts:275-282).
// Deprecated builds are precisely what an incident responder rolls back to,
// so they must stay selectable even though they are hidden from `get`.
func UpdatableVersions(s Software) []string { return allOptionValues(s) }

// ResolveVersion validates a user-provided version against the set Node's
// _processComponentVersion accepts (software.ts:275). The "Use one of:" list
// is built from the same values, so it advertises deprecated versions too.
func ResolveVersion(s Software, component, version string) (string, error) {
	allowed := UpdatableVersions(s)
	if !contains(allowed, version) {
		return "", &ValidationError{"Version " + version + " is not supported for " + componentNames[component] + ". Use one of: " + strings.Join(allowed, ",")}
	}
	return version, nil
}

// Package nodeflags ports the option-value grammar that the Node CLI applies
// to flag values before a handler ever sees them.
//
// Node registers every non-boolean option with commander as `--name [value]`
// (src/lib/cli/command.js:111-114) and hands the raw token to a per-option
// parse function. The parse functions live in
// src/lib/dev-environment/dev-environment-cli.ts and are ported here verbatim,
// including their edge cases. Nothing in this package prompts, validates
// against the network, or touches disk — it is pure value coercion plus the
// argv reshaping that gives cobra commander's optional-value lookahead.
package nodeflags

import "strings"

// FalseOptions / TrueOptions mirror dev-environment-cli.ts:924-925.
var (
	FalseOptions = []string{"false", "no", "n", "0"}
	TrueOptions  = []string{"true", "yes", "y", "1"}
)

func containsFold(list []string, v string) bool {
	lower := strings.ToLower(v)
	for _, x := range list {
		if x == lower {
			return true
		}
	}
	return false
}

// ProcessBooleanOption ports processBooleanOption (dev-environment-cli.ts:939).
//
//	if ( ! value ) { return false; }
//	return ! FALSE_OPTIONS.includes( value.toString().toLowerCase() );
//
// Two consequences worth stating because they are easy to "fix" by accident:
//
//   - An unrecognized value is TRUE, not an error. `--xdebug maybe` enables
//     Xdebug in Node, so it must enable it here.
//   - The empty string is false: JS short-circuits on the falsy value
//     before the FALSE_OPTIONS lookup ever runs.
func ProcessBooleanOption(value string) bool {
	if value == "" {
		return false
	}
	return !containsFold(FalseOptions, value)
}

// MediaRedirectDomainError is the UserError message Node throws when the
// media redirect domain is given a truthy word instead of a domain
// (dev-environment-cli.ts:957).
const MediaRedirectDomainError = "Media redirect domain must be a domain name or an URL"

type mediaRedirectError struct{}

func (mediaRedirectError) Error() string { return MediaRedirectDomainError }

// ProcessMediaRedirectDomainOption ports processMediaRedirectDomainOption
// (dev-environment-cli.ts:948). A FALSE_OPTIONS value DISABLES the redirect
// (returns ""); a TRUE_OPTIONS value is a user error; anything else is the
// domain itself.
func ProcessMediaRedirectDomainOption(value string) (string, error) {
	if containsFold(FalseOptions, value) {
		return "", nil
	}
	if containsFold(TrueOptions, value) {
		return "", mediaRedirectError{}
	}
	return value, nil
}

// Kind distinguishes the two arms of Node's `string | boolean` return type.
type Kind int

const (
	KindBool Kind = iota
	KindString
)

// StringOrBool is the Go shape of Node's `string | boolean` union.
type StringOrBool struct {
	Kind   Kind
	Bool   bool
	String string
}

// ProcessStringOrBooleanOption ports processStringOrBooleanOption
// (dev-environment-cli.ts:963). Used by `dev-env create --multisite`, whose
// accepted values are "y"/"subdirectory"/"false".
func ProcessStringOrBooleanOption(value string) StringOrBool {
	if value == "" || containsFold(FalseOptions, value) {
		return StringOrBool{Kind: KindBool, Bool: false}
	}
	if containsFold(TrueOptions, value) {
		return StringOrBool{Kind: KindBool, Bool: true}
	}
	return StringOrBool{Kind: KindString, String: value}
}

// ProcessSlug ports processSlug (dev-environment-cli.ts:979): coerce to a
// string, then toLowerCase. Every Node dev-env bin that
// registers --slug passes this as the option's parse function, so the slug is
// lowercased before it ever reaches the on-disk environment path or the
// compose project name.
func ProcessSlug(value string) string { return strings.ToLower(value) }

// Component is the Go shape of Node's LocalComponent | ImageComponent
// (dev-environment-cli.ts:217-227).
type Component struct {
	Mode string // "local" or "image"
	Dir  string // set when Mode == "local"
	Tag  string // set when Mode == "image"; "" mirrors Node's `undefined`
}

// ProcessComponentOptionInput ports processComponentOptionInput
// (dev-environment-cli.ts:237). The "naive check" for a local path is Node's
// own wording: any value containing a forward or back slash is a directory
// when allowLocal is set. "demo" and "image" resolve to the default image
// (Node returns tag `undefined`), which is why `--app-code demo` must NOT
// become a literal bind-mount path.
func ProcessComponentOptionInput(param string, allowLocal bool) Component {
	if allowLocal && strings.ContainsAny(param, `/\`) {
		return Component{Mode: "local", Dir: param}
	}
	tag := param
	if param == "demo" || param == "image" {
		tag = ""
	}
	return Component{Mode: "image", Tag: tag}
}

package devenv

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// Ports src/lib/dev-environment/dev-environment-configuration-file.ts.
//
// Node walks UP from the working directory looking for a dev-env configuration
// file and, when one is found, uses its `slug` as the environment every
// dev-env command targets (getEnvironmentName, dev-environment-cli.ts:166).
// vip-next ignored the file entirely, so in a configured repo `dev-env destroy`
// tore down whatever environment happened to be the only one on disk instead of
// the configured one (register item 2.21).

const (
	// configFolder is Node's CONFIGURATION_FOLDER (dev-environment-cli.ts:50).
	configFolder = ".wpvip"
	// configFileName / configTemplateFileName are CONFIGURATION_FILE_NAME and
	// CONFIGURATION_TEMPLATE_FILE_NAME.
	configFileName         = "vip-dev-env.yml"
	configTemplateFileName = "vip-dev-env.yml.ejs"
	// configWalkMaxDepth is Node's `maxDepth` sanity bound on the upward walk.
	configWalkMaxDepth = 64
)

// configFileVersions is Node's CONFIGURATION_FILE_VERSIONS.
var configFileVersions = []string{"1"}

// ConfigFile is a sanitized dev-env configuration file — the Go equivalent of
// Node's ConfigurationFileOptions plus its `meta['configuration-path']`.
type ConfigFile struct {
	// Path is the file the values came from; Node prints it in the
	// "Using environment X from Y" line.
	Path                string
	Version             string
	Slug                string
	Title               string
	Multisite           string // "", "subdomain", "subdirectory", "true"/"false"
	PHP                 string
	WordPress           string
	MuPlugins           string
	AppCode             string
	MediaRedirectDomain string
	Overrides           string
	Elasticsearch       *bool
	PHPMyAdmin          *bool
	Xdebug              *bool
	Mailpit             *bool
	Photon              *bool
	Cron                *bool
}

// LoadConfigFile runs the discovery from the process working directory, which
// is what Node uses (findConfigurationFile starts at process.cwd()).
func LoadConfigFile() (*ConfigFile, error) {
	wd, err := os.Getwd()
	if err != nil {
		return nil, nil //nolint:nilerr // no cwd => no configuration, same as Node's read failure
	}
	return FindConfigFile(wd)
}

// FindConfigFile walks up from startDir looking for a dev-env configuration
// file, returning nil when there is none. A file that IS found but cannot be
// parsed is a hard error — Node calls exit.withError() there, and silently
// continuing would let a destructive command target the wrong environment.
func FindConfigFile(startDir string) (*ConfigFile, error) {
	for _, cand := range configFileCandidates(startDir) {
		b, err := os.ReadFile(cand.file) // #nosec G304 -- walked, user-owned repo path
		if err != nil {
			// Node debug-logs and moves to the next candidate.
			continue
		}
		contents := string(b)
		if cand.template {
			rendered, rerr := renderConfigTemplate(contents, cand.dir)
			if rerr != nil {
				return nil, fmt.Errorf("Configuration file %s could not be loaded:\n%s", cand.file, rerr)
			}
			contents = rendered
		}
		return sanitizeConfigFile(contents, cand.file)
	}
	return nil, nil
}

type configCandidate struct {
	dir      string
	file     string
	template bool
}

// configFileCandidates reproduces findConfigurationFile's location list: for
// each directory from startDir upward (stopping AT — not including — the
// filesystem root, and after 64 directories), four candidates in this order:
//
//	<dir>/.wpvip/vip-dev-env.yml.ejs   (template)
//	<dir>/.wpvip/vip-dev-env.yml
//	<dir>/.vip-dev-env.yml.ejs         (template)
//	<dir>/.vip-dev-env.yml
//
// The whole list is built first and then probed in order, so every candidate in
// a nearer directory beats every candidate in an ancestor.
func configFileCandidates(startDir string) []configCandidate {
	current := filepath.Clean(startDir)
	root := filepath.Dir(current)
	for root != filepath.Dir(root) {
		root = filepath.Dir(root)
	}

	var out []configCandidate
	for depth := 0; current != root && depth < configWalkMaxDepth; depth++ {
		wpvip := filepath.Join(current, configFolder)
		out = append(out,
			configCandidate{dir: wpvip, file: filepath.Join(wpvip, configTemplateFileName), template: true},
			configCandidate{dir: wpvip, file: filepath.Join(wpvip, configFileName), template: false},
			configCandidate{dir: current, file: filepath.Join(current, "."+configTemplateFileName), template: true},
			configCandidate{dir: current, file: filepath.Join(current, "."+configFileName), template: false},
		)
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	return out
}

// ejsTagRE matches any remaining EJS tag after configDir substitution.
var ejsTagRE = regexp.MustCompile(`<%[-=_]?[\s\S]*?%>`)

// configDirTagRE matches the one expression Node's template context provides:
// `configDir` (ejs.render(contents, { configDir: dir })).
var configDirTagRE = regexp.MustCompile(`<%[-=]\s*configDir\s*-?%>`)

// renderConfigTemplate renders a .ejs configuration template. Node runs a full
// EJS engine with exactly one variable in scope (configDir), which is all the
// documented templates use. Anything richer is refused rather than silently
// mis-rendered: a template we cannot evaluate would otherwise resolve to a
// DIFFERENT environment than the Node CLI targets, on commands that delete data.
func renderConfigTemplate(contents, configDir string) (string, error) {
	rendered := configDirTagRE.ReplaceAllLiteralString(contents, configDir)
	if tag := ejsTagRE.FindString(rendered); tag != "" {
		return "", fmt.Errorf("unsupported EJS expression %q (only <%%= configDir %%> is supported)", tag)
	}
	return rendered, nil
}

// sanitizeConfigFile ports sanitizeConfiguration + adjustRelativePaths,
// including the exact error wording Node exits with.
func sanitizeConfigFile(contents, path string) (*ConfigFile, error) {
	// yaml.v3 decodes scalars into `any` as typed values; decoding into
	// map[string]string-ish accessors below keeps them verbatim, matching
	// Node's FAILSAFE_SCHEMA ("Only allow strings, arrays, and objects").
	var node yaml.Node
	if err := yaml.Unmarshal([]byte(contents), &node); err != nil {
		return nil, fmt.Errorf("Configuration file %s could not be loaded:\n%s", path, err)
	}
	raw := failsafeMapping(&node)
	if raw == nil {
		return nil, configGenericError(path)
	}

	version, hasVersion := raw["configuration-version"]
	slug, hasSlug := raw["slug"]
	if !hasVersion || version == "" || !hasSlug {
		return nil, configGenericError(path)
	}
	if !isValidConfigVersion(version) {
		return nil, fmt.Errorf(
			"Configuration file %s has an invalid configuration-version key. "+
				"Update to a supported version. For example:\n\n%s\nSupported configuration versions: %s.\n",
			path, configFileExample(), strings.Join(configFileVersions, ", "))
	}

	cfg := &ConfigFile{
		Path:                path,
		Version:             version,
		Slug:                slug,
		Title:               raw["title"],
		Multisite:           raw["multisite"],
		PHP:                 raw["php"],
		WordPress:           raw["wordpress"],
		MuPlugins:           raw["mu-plugins"],
		AppCode:             raw["app-code"],
		MediaRedirectDomain: raw["media-redirect-domain"],
		Overrides:           raw["overrides"],
		Elasticsearch:       stringToBoolIfDefined(raw, "elasticsearch"),
		PHPMyAdmin:          stringToBoolIfDefined(raw, "phpmyadmin"),
		Xdebug:              stringToBoolIfDefined(raw, "xdebug"),
		Mailpit:             stringToBoolIfDefined(raw, "mailpit"),
		Photon:              stringToBoolIfDefined(raw, "photon"),
		Cron:                stringToBoolIfDefined(raw, "cron"),
	}
	adjustConfigRelativePaths(cfg)
	return cfg, nil
}

// failsafeMapping returns the document's top-level mapping as string->string,
// or nil when the document is not a mapping (Node: `Array.isArray(configuration)
// || typeof configuration !== 'object'` -> generic error). Nested values are
// not used by any consumer, so only scalars are collected.
func failsafeMapping(doc *yaml.Node) map[string]string {
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		return nil
	}
	m := doc.Content[0]
	if m.Kind != yaml.MappingNode {
		return nil
	}
	out := make(map[string]string, len(m.Content)/2)
	for i := 0; i+1 < len(m.Content); i += 2 {
		key, val := m.Content[i], m.Content[i+1]
		if key.Kind != yaml.ScalarNode {
			continue
		}
		if val.Kind == yaml.ScalarNode {
			// Scalar Value is the verbatim source text, which is exactly what
			// FAILSAFE_SCHEMA yields (php: 8.10 stays "8.10", not 8.1).
			out[key.Value] = val.Value
		}
	}
	return out
}

// stringToBoolIfDefined ports Node's stringToBooleanIfDefined: only the exact
// strings "true"/"false" produce a value; everything else (including a missing
// key) stays undefined.
func stringToBoolIfDefined(raw map[string]string, key string) *bool {
	v, ok := raw[key]
	if !ok {
		return nil
	}
	switch v {
	case "true":
		t := true
		return &t
	case "false":
		f := false
		return &f
	}
	return nil
}

// adjustConfigRelativePaths ports adjustRelativePaths: app-code and mu-plugins
// are resolved against the configuration file's directory unless they are one
// of the image keywords.
func adjustConfigRelativePaths(cfg *ConfigFile) {
	dir := filepath.Dir(cfg.Path)
	fix := func(v string) string {
		if v == "" || v == "demo" || v == "image" || filepath.IsAbs(v) {
			return v
		}
		return filepath.Join(dir, v)
	}
	cfg.AppCode = fix(cfg.AppCode)
	cfg.MuPlugins = fix(cfg.MuPlugins)
}

func isValidConfigVersion(v string) bool {
	for _, known := range configFileVersions {
		if known == v {
			return true
		}
	}
	return false
}

func configGenericError(path string) error {
	return fmt.Errorf(
		"Configuration file %s is available but couldn't be loaded. "+
			"Ensure there is a configuration-version and slug configured. For example:\n\n%s",
		path, configFileExample())
}

// configFileExample ports getConfigurationFileExample().
func configFileExample() string {
	return fmt.Sprintf(`configuration-version: %s
slug: dev-site
title: Dev Site
php: 8.2
wordpress: 6.2
app-code: ../
mu-plugins: image
multisite: false
phpmyadmin: false
elasticsearch: false
xdebug: false
mailpit: false
photon: false
cron: false
`, configFileVersions[len(configFileVersions)-1])
}

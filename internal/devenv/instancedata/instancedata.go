// Package instancedata reads and writes a dev environment's
// instance_data.json. Ports the data layer of dev-environment-core.ts
// (readEnvironmentData / writeEnvironmentData / getAllEnvironmentNames /
// doesEnvironmentExist). Unknown keys are preserved losslessly so files
// written by older/newer CLIs survive a round-trip (spec §10).
package instancedata

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Automattic/vip/internal/devenv/paths"
)

// ComponentConfig mirrors types.ts ComponentConfig.
type ComponentConfig struct {
	Mode  string `json:"mode"`
	Dir   string `json:"dir,omitempty"`
	Image string `json:"image,omitempty"`
	Tag   string `json:"tag,omitempty"`
}

// WordPressConfig mirrors types.ts WordPressConfig.
type WordPressConfig struct {
	Mode         string `json:"mode"`
	Tag          string `json:"tag"`
	Ref          string `json:"ref,omitempty"`
	DoNotUpgrade bool   `json:"doNotUpgrade,omitempty"`
}

// InstanceData mirrors types.ts InstanceData. multisite and elasticsearch
// are JS union types (bool|string), kept as json.RawMessage to round-trip
// faithfully; typed accessors are added in a later plan when consumers
// need them. Extra holds every key not modeled above, preserved verbatim.
type InstanceData struct {
	SiteSlug string `json:"siteSlug"`
	WPTitle  string `json:"wpTitle"`
	// Multisite is a JS union (bool|string). NOTE for environment-creation
	// code (Plan 4): a nil value serializes as `"multisite": null`, which
	// differs from the Node CLI (it always writes `false` or a string).
	// Creators MUST set this explicitly (e.g. json.RawMessage("false")) to
	// match Node output; reads round-trip whatever was on disk.
	Multisite           json.RawMessage `json:"multisite"`
	WordPress           WordPressConfig `json:"wordpress"`
	MuPlugins           ComponentConfig `json:"muPlugins"`
	AppCode             ComponentConfig `json:"appCode"`
	MediaRedirectDomain string          `json:"mediaRedirectDomain"`
	PHPMyAdmin          bool            `json:"phpmyadmin"`
	Xdebug              bool            `json:"xdebug"`
	XdebugConfig        string          `json:"xdebugConfig,omitempty"`
	MariaDB             string          `json:"mariadb,omitempty"`
	PHP                 string          `json:"php"`
	Elasticsearch       json.RawMessage `json:"elasticsearch,omitempty"`
	Mailpit             bool            `json:"mailpit"`
	Photon              bool            `json:"photon"`
	Cron                bool            `json:"cron"`
	PullAfter           *int64          `json:"pullAfter,omitempty"`
	AutologinKey        string          `json:"autologinKey,omitempty"`
	AdminPassword       string          `json:"adminPassword,omitempty"`
	Version             string          `json:"version,omitempty"`
	Overrides           string          `json:"overrides,omitempty"`
	// MigratedFromLando is an RFC3339 timestamp stamped the first time this env
	// was adopted from a pre-existing Lando environment (Go-only; surfaced in
	// `dev-env info`). Empty means never adopted.
	MigratedFromLando string `json:"migratedFromLando,omitempty"`
	// Domain is the per-env domain. New envs pin it explicitly at create
	// (compose.DefaultDomain, "vipdev.site", unless `create --domain` overrides);
	// an empty value marks a pre-switch/legacy env and is backfilled to
	// LegacyDomain ("vipdev.lndo.site") on read. Consumed by compose.Options.Domain.
	Domain string `json:"domain,omitempty"`
	// ExternalVolumes maps a logical volume name to an existing (Lando) volume
	// name; non-empty marks the env as migrated (Plan 4 §D). Declared external
	// in the rendered compose so a destroy never deletes the original data.
	ExternalVolumes map[string]string `json:"externalVolumes,omitempty"`
	// EnvVars holds per-env user variables (Plan 5 `dev-env envvar`). Node
	// stores these in the env's .env file; the Go port keeps them here in
	// instance_data.json because Materialize owns/overwrites .env on every
	// Start/Rebuild. They are injected into the php service environment on
	// materialize (compose.View.EnvVars).
	EnvVars map[string]string `json:"envVars,omitempty"`

	// Extra carries unmodeled keys verbatim for lossless round-trip.
	Extra map[string]json.RawMessage `json:"-"`
}

// LegacyDomain is the domain used by envs created before the vipdev.site switch
// (and Lando-migrated envs). An env whose stored Domain is empty predates the
// switch, so it is backfilled to this value on read — keeping its DB siteurl
// (which references *.vipdev.lndo.site) valid. New envs pin compose.DefaultDomain
// explicitly at create time, so they are never empty and never backfilled.
const LegacyDomain = "vipdev.lndo.site"

// knownKeys is the set of JSON keys modeled by InstanceData's fields.
var knownKeys = map[string]bool{
	"siteSlug": true, "wpTitle": true, "multisite": true, "wordpress": true,
	"muPlugins": true, "appCode": true, "mediaRedirectDomain": true,
	"phpmyadmin": true, "xdebug": true, "xdebugConfig": true, "mariadb": true,
	"php": true, "elasticsearch": true, "mailpit": true, "photon": true,
	"cron": true, "pullAfter": true, "autologinKey": true, "adminPassword": true,
	"version": true, "overrides": true,
	"domain": true, "externalVolumes": true, "envVars": true,
	"migratedFromLando": true,
}

func parse(b []byte) (*InstanceData, error) {
	d := &InstanceData{}
	if err := json.Unmarshal(b, d); err != nil {
		return nil, err
	}

	var all map[string]json.RawMessage
	if err := json.Unmarshal(b, &all); err != nil {
		return nil, err
	}
	d.Extra = map[string]json.RawMessage{}
	for k, v := range all {
		if !knownKeys[k] {
			d.Extra[k] = v
		}
	}

	applyBackcompat(d)
	return d, nil
}

// serialize merges modeled fields over the preserved unknown keys and
// emits 2-space-indented JSON (matching Node's JSON.stringify(data, null, 2)
// indentation; key ordering may differ, which is acceptable per spec §10).
func serialize(d *InstanceData) ([]byte, error) {
	knownBytes, err := json.Marshal(d)
	if err != nil {
		return nil, err
	}
	var known map[string]json.RawMessage
	if err := json.Unmarshal(knownBytes, &known); err != nil {
		return nil, err
	}

	merged := make(map[string]json.RawMessage, len(d.Extra)+len(known))
	for k, v := range d.Extra {
		merged[k] = v
	}
	for k, v := range known {
		merged[k] = v
	}
	return json.MarshalIndent(merged, "", "  ")
}

// applyBackcompat ports the BACKWARDS COMPATIBILITY section of
// readEnvironmentData (dev-environment-core.ts:558-575).
func applyBackcompat(d *InstanceData) {
	// enterpriseSearchEnabled / elasticsearchEnabled -> elasticsearch
	for _, legacy := range []string{"enterpriseSearchEnabled", "elasticsearchEnabled"} {
		if v, ok := d.Extra[legacy]; ok && isTruthyJSON(v) {
			d.Elasticsearch = json.RawMessage("true")
		}
	}
	// clientCode -> appCode
	if v, ok := d.Extra["clientCode"]; ok {
		var cc ComponentConfig
		if err := json.Unmarshal(v, &cc); err == nil {
			d.AppCode = cc
		}
	}
	// Envs created before the vipdev.site switch stored no domain; pin them to the
	// legacy domain so they keep resolving to their original *.vipdev.lndo.site host.
	if d.Domain == "" {
		d.Domain = LegacyDomain
	}
}

func isTruthyJSON(v json.RawMessage) bool {
	var b bool
	if err := json.Unmarshal(v, &b); err == nil {
		return b
	}
	var s string
	if err := json.Unmarshal(v, &s); err == nil {
		return s != ""
	}
	return false
}

const instanceDataFileName = "instance_data.json"

// Read loads and migrates an environment's instance data. Error messages
// mirror readEnvironmentData (dev-environment-core.ts:529-578).
func Read(slug string) (*InstanceData, error) {
	target := filepath.Join(paths.EnvironmentPath(slug), instanceDataFileName)
	b, err := os.ReadFile(target)
	if err != nil {
		return nil, fmt.Errorf("There was an error reading file %q: %s.", target, err)
	}
	d, err := parse(b)
	if err != nil {
		return nil, fmt.Errorf("There was an error parsing file %q: %s. You may need to recreate the environment.", target, err)
	}
	return d, nil
}

// Write serializes instance data to disk, creating the env directory if
// needed. Ports writeEnvironmentData (2-space indent).
func Write(slug string, d *InstanceData) error {
	dir := paths.EnvironmentPath(slug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	out, err := serialize(d)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, instanceDataFileName), out, 0o644)
}

// Exists reports whether an environment's instance_data.json is a file.
// Ports doesEnvironmentExist (dev-environment-core.ts:518-527).
func Exists(slug string) bool {
	info, err := os.Stat(filepath.Join(paths.EnvironmentPath(slug), instanceDataFileName))
	return err == nil && info.Mode().IsRegular()
}

// AllNames lists environment directory names under the dev-env base dir.
// Ports getAllEnvironmentNames (dev-environment-core.ts:705-723): only
// directories count; a missing base dir yields an empty slice.
func AllNames() []string {
	entries, err := os.ReadDir(paths.DevEnvBase())
	if err != nil {
		return nil
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names
}

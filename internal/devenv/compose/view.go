package compose

import (
	"encoding/json"
	"strings"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

const (
	// DefaultDomain is the domain NEW envs pin. Automattic owns vipdev.site and
	// *.vipdev.site resolves to 127.0.0.1 publicly; the managed hosts block makes
	// it work offline too. Legacy/migrated envs keep instancedata.LegacyDomain.
	DefaultDomain = "vipdev.site"
	// ProxyNetwork is the shared external network that the central Traefik proxy
	// and each env's Traefik-routed edge services (nginx/phpmyadmin/mailpit) join
	// so the proxy can reach them. Backend services must NOT join it: every env's
	// compose registers the bare service name (e.g. `database`) as an alias on
	// each network it joins, and those bare aliases collide across environments on
	// this shared network, so Docker round-robin DNS would route one env's `wp` to
	// another env's database (cross-env data bleed). Backends stay on ProjectNetwork.
	ProxyNetwork = "vip-dev-env"
	// ProjectNetwork is the per-environment network. Keyed "default", docker
	// compose scopes it to `<project>_default` (project == slug), so the bare
	// `database`/`memcached`/etc. aliases resolve only within the env. This is the
	// isolation Lando got from its per-app network (`<app>_default`) while scoping
	// the shared-bridge alias to `<service>.<app>.internal`; plain compose can't
	// suppress the bare alias on a shared network, so we keep backends off it.
	ProjectNetwork = "default"
)

// Options carries render-time inputs not stored in InstanceData.
type Options struct {
	// Domain overrides DefaultDomain (per-env custom domain; Plan 3/5).
	Domain string
	// HostUID/HostGID feed the LANDO_HOST_USER_ID/GID env. Defaults "1000".
	HostUID string
	HostGID string
	// Migrate, when true, declares data volumes external (Plan 4 migration).
	Migrate bool
	// ExternalVolumeNames maps logical volume name -> existing external name
	// (only consulted when Migrate is true).
	ExternalVolumeNames map[string]string
}

// View is the fully-resolved, pure input the service/label builders consume.
type View struct {
	SiteSlug string
	WPTitle  string
	Domain   string

	MultisiteEnabled   bool
	MultisiteSubdomain bool

	PHPImage       string
	DatabaseImage  string
	WordPressImage string

	Xdebug        bool
	XdebugConfig  string
	Cron          bool
	AutologinKey  string
	AdminPassword string

	PHPMyAdmin    bool
	Elasticsearch bool
	Mailpit       bool
	Photon        bool

	MuPluginsLocal bool
	MuPluginsDir   string
	AppCodeLocal   bool
	AppCodeDir     string

	HostUID string
	HostGID string

	Migrate             bool
	ExternalVolumeNames map[string]string
	// EnvVars are per-env user variables injected into the php service
	// environment (Plan 5 envvar). Reserved keys win over user keys.
	EnvVars map[string]string
	// MigratedFromLando carries instancedata's marker into the info table
	// (Go-only). Empty for envs never adopted from Lando.
	MigratedFromLando string
}

// NewView derives a View from instance data + options, applying the same
// defaults as preProcessInstanceData (dev-environment-core.ts:317-347).
func NewView(d *instancedata.InstanceData, opts Options) View {
	v := View{
		SiteSlug:            d.SiteSlug,
		WPTitle:             d.WPTitle,
		Domain:              firstNonEmpty(opts.Domain, DefaultDomain),
		PHPImage:            phpImage(d.PHP),
		WordPressImage:      "ghcr.io/automattic/vip-container-images/wordpress:" + wordpressTag(d),
		Xdebug:              d.Xdebug,
		XdebugConfig:        d.XdebugConfig,
		Cron:                d.Cron,
		AutologinKey:        d.AutologinKey,
		AdminPassword:       firstNonEmpty(d.AdminPassword, "password"),
		PHPMyAdmin:          d.PHPMyAdmin,
		Elasticsearch:       truthyRaw(d.Elasticsearch),
		Mailpit:             d.Mailpit,
		Photon:              d.Photon,
		MuPluginsLocal:      d.MuPlugins.Mode == "local",
		MuPluginsDir:        d.MuPlugins.Dir,
		AppCodeLocal:        d.AppCode.Mode == "local",
		AppCodeDir:          d.AppCode.Dir,
		HostUID:             firstNonEmpty(opts.HostUID, "1000"),
		HostGID:             firstNonEmpty(opts.HostGID, "1000"),
		Migrate:             opts.Migrate,
		ExternalVolumeNames: opts.ExternalVolumeNames,
		EnvVars:             d.EnvVars,
		MigratedFromLando:   d.MigratedFromLando,
	}

	v.MultisiteEnabled, v.MultisiteSubdomain = multisite(d.Multisite)

	if d.MariaDB != "" {
		v.DatabaseImage = "mariadb:" + d.MariaDB
	} else {
		v.DatabaseImage = "mysql:8.4"
	}
	return v
}

func firstNonEmpty(vals ...string) string {
	for _, s := range vals {
		if s != "" {
			return s
		}
	}
	return ""
}

func wordpressTag(d *instancedata.InstanceData) string {
	if d.WordPress.Tag != "" {
		return d.WordPress.Tag
	}
	return "trunk"
}

// phpFPMImagePrefix is the VIP php-fpm image repo; a bare version is appended.
const phpFPMImagePrefix = "ghcr.io/automattic/vip-container-images/php-fpm:"

// defaultPHPImage is the recommended php-fpm image when none is specified —
// the first entry of Node's DEV_ENVIRONMENT_PHP_VERSIONS (8.2, recommended).
const defaultPHPImage = phpFPMImagePrefix + "8.2"

// phpImage resolves the php-fpm image from instance-data's php field, mirroring
// Node DEV_ENVIRONMENT_PHP_VERSIONS resolution: empty -> recommended default; a
// bare version like "8.3" -> the matching php-fpm image; an explicit image
// reference (already containing "/" or ":") -> used verbatim. Resolving at
// render time matches how wordpressTag/DatabaseImage already default.
func phpImage(php string) string {
	if php == "" {
		return defaultPHPImage
	}
	if strings.ContainsAny(php, "/:") {
		return php
	}
	return phpFPMImagePrefix + php
}

// multisite interprets the bool|string union. bool true => enabled+subdomain
// (per the EJS `multisite === true || === 'subdomain'` subdomain branch); the
// string "subdomain" => enabled+subdomain; any other non-empty string =>
// enabled (subdirectory). Mirrors the EJS `if (multisite)` gate.
func multisite(raw json.RawMessage) (enabled, subdomain bool) {
	if len(raw) == 0 {
		return false, false
	}
	var b bool
	if err := json.Unmarshal(raw, &b); err == nil {
		return b, b
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		s = strings.ToLower(s)
		if s == "" {
			return false, false
		}
		return true, s == "subdomain"
	}
	return false, false
}

func truthyRaw(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}
	var b bool
	if err := json.Unmarshal(raw, &b); err == nil {
		return b
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s != ""
	}
	return false
}

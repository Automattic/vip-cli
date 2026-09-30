package compose

import (
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

// RenderCompose marshals the assembled project to docker-compose.yml bytes.
func RenderCompose(v View) ([]byte, error) {
	return yaml.Marshal(BuildProject(v))
}

// RenderEnvFile renders the .env file consumed by services (host UID/GID).
func RenderEnvFile(v View) string {
	return fmt.Sprintf("LANDO_HOST_USER_ID=%s\nLANDO_HOST_GROUP_ID=%s\n", v.HostUID, v.HostGID)
}

// RenderNginxConf ports assets/dev-env.nginx.template.conf.ejs. Missing
// uploads redirect before Photon runs; existing images with query parameters
// go to Photon, while other existing files are served locally by nginx.
func RenderNginxConf(v View) string {
	var b strings.Builder
	b.WriteString("# VIP dev-env extra nginx configuration\n")
	if v.Photon {
		b.WriteString(`
location ^~ /wp-content/uploads/ {
    expires max;
    log_not_found off;
`)
		if v.MediaRedirectDomain != "" {
			fmt.Fprintf(&b, `    if (!-f $request_filename) {
        rewrite ^/(.*)$ %s redirect;
    }
`, nginxRedirectTarget(v.MediaRedirectDomain))
		}
		b.WriteString(`
    include fastcgi_params;
    fastcgi_param DOCUMENT_ROOT /usr/share/webapps/photon;
    fastcgi_param SCRIPT_FILENAME /usr/share/webapps/photon/index.php;
    fastcgi_param SCRIPT_NAME /index.php;

    if ($request_uri ~* \.(gif|jpe?g|png)\?) {
        fastcgi_pass photon:9000;
    }
}
`)
	} else if v.MediaRedirectDomain != "" {
		fmt.Fprintf(&b, `
location ^~ /wp-content/uploads {
    expires max;
    log_not_found off;
    try_files $uri @prod_site;
}

location @prod_site {
    rewrite ^/(.*)$ %s redirect;
}
`, nginxRedirectTarget(v.MediaRedirectDomain))
	}
	return b.String()
}

// EJS's <%= interpolation XML-escapes its value. Preserve that behavior, then
// quote it as one nginx argument so config delimiters cannot add directives.
// Keep nginx variables (including the appended $1 capture) intact, as in Node.
// URL controls must be percent-encoded: nginx decodes \r/\n escapes back to
// control bytes, which would then be copied into the Location response header.
func nginxRedirectTarget(domain string) string {
	escaped := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&#34;", "'", "&#39;").Replace(domain)
	var target strings.Builder
	target.WriteByte('"')
	for i := 0; i < len(escaped); i++ {
		c := escaped[i]
		switch {
		case c < 0x20 || c == 0x7f:
			fmt.Fprintf(&target, "%%%02X", c)
		case c == '\\':
			target.WriteString(`\\`)
		default:
			target.WriteByte(c)
		}
	}
	target.WriteString(`/$1"`)
	return target.String()
}

// SetupStep is a post-start command the lifecycle runs in the php service.
type SetupStep struct {
	AsRoot  bool
	Command string
}

// SetupSteps ports the EJS php run_as_root + run steps (lines 88-101): chown
// the WordPress content paths to www-data (root), then run setup.sh as the
// service user. The lifecycle (Plan 4) executes these after `up`.
func SetupSteps(v View) []SetupStep {
	steps := []SetupStep{
		{AsRoot: true, Command: "chown www-data:www-data /wp/wp-content/mu-plugins /wp/config /wp/log /wp/wp-content/uploads /wp"},
	}
	if !v.AppCodeLocal {
		steps = append(steps, SetupStep{AsRoot: true, Command: "chown www-data:www-data /wp/wp-content/plugins"})
	}

	var b strings.Builder
	fmt.Fprintf(&b, `sh /dev-tools/setup.sh --host database --user root --domain "http://%s.%s/" --title "%s" --wpadmin_password "%s"`,
		v.SiteSlug, v.Domain, v.WPTitle, v.AdminPassword)
	if v.MultisiteEnabled {
		fmt.Fprintf(&b, ` --ms-domain "%s.%s"`, v.SiteSlug, v.Domain)
		if v.MultisiteSubdomain {
			b.WriteString(" --subdomain")
		}
	}
	steps = append(steps, SetupStep{AsRoot: false, Command: b.String()})
	return steps
}

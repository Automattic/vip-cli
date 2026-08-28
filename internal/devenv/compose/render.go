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

// RenderNginxConf renders nginx/extra.conf. The Node template is currently
// empty boilerplate; emit a minimal valid file.
func RenderNginxConf(_ View) string {
	return "# VIP dev-env extra nginx configuration\n"
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

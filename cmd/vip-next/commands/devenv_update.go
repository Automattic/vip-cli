package commands

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/devenv/instancedata"
)

// devEnvUpdateWizardIntro heads the interactive update wizard.
const devEnvUpdateWizardIntro = "Update wizard — each value defaults to the environment's current setting;\n" +
	"press Enter to keep it, or change it. Pass the matching flags (or\n" +
	"--non-interactive) to skip the wizard.\n\n"

func newDevEnvUpdateCmd() *cobra.Command {
	c := &cobra.Command{
		Use:           "update",
		Short:         "Update a local environment",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          runDevEnvUpdate,
	}
	f := c.Flags()
	addXdebugConfigAlias(c)
	f.StringP("slug", "s", "", "A unique name for a local environment.")
	f.String("php", "", "PHP image/version.")
	f.StringP("wordpress", "w", "", "WordPress version tag.")
	f.StringP("mu-plugins", "u", "", `Source for VIP MU plugins. Accepts "demo" or a local path.`)
	f.StringP("app-code", "a", "", `Source for application code. Accepts "demo" or a local path.`)
	addDevEnvServiceFlags(c)
	f.StringP("media-redirect-domain", "r", "", `Proxy media from a VIP Platform environment. Accepts a domain, or "n" to disable.`)
	return c
}

func runDevEnvUpdate(cmd *cobra.Command, _ []string) error {
	slug, err := ResolveSlug(cmd)
	if err != nil {
		return err
	}
	cur, err := instancedata.Read(slug)
	if err != nil {
		return err
	}
	c, err := resolveUpdateConfig(cmd, cur)
	if err != nil {
		return err
	}
	if err := devenv.Update(cmd.Context(), slug, c); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Environment %q updated. Restart it for changes to take effect:\n  vip dev-env --slug %s start\n", slug, slug)
	return nil
}

// resolveUpdateConfig builds the UpdateConfig from flags, running the setup
// wizard for any field not passed as a flag when interactive (each prompt
// defaults to the env's CURRENT value — Node's update behavior). A flag always
// wins; non-interactive runs only overlay the passed flags (everything else is
// left unchanged), so scripted update stays headless. Title and multisite are
// intentionally not prompted (Node keeps them on update).
func resolveUpdateConfig(cmd *cobra.Command, cur *instancedata.InstanceData) (devenv.UpdateConfig, error) {
	f := cmd.Flags()
	interactive := appctx.IsInteractive(cmd)
	if interactive {
		fmt.Fprint(cmd.OutOrStdout(), devEnvUpdateWizardIntro)
	}

	var c devenv.UpdateConfig

	// php — default to the current version's label.
	if f.Changed("php") {
		v, _ := f.GetString("php")
		c.PHP = &v
	} else if interactive {
		sel, err := selectWithDefault(cmd, "PHP version", phpLabels(), phpLabelForVersion(currentPHPVersion(cur)))
		if err != nil {
			return c, err
		}
		v := phpVersionForLabel(sel)
		c.PHP = &v
	}

	// wordpress — default to the current tag.
	if f.Changed("wordpress") {
		v, _ := f.GetString("wordpress")
		c.WordPress = &v
	} else if interactive {
		v, err := selectWithDefault(cmd, "WordPress version", wordpressVersionChoices(), cur.WordPress.Tag)
		if err != nil {
			return c, err
		}
		c.WordPress = &v
	}

	// mu-plugins / app-code — default to the current local path.
	if f.Changed("mu-plugins") {
		v := devEnvComponentDir(cmd, "mu-plugins")
		c.MuPluginsDir = &v
	} else if interactive {
		v, err := appctx.Input(cmd, "Path to local mu-plugins (blank for image)", cur.MuPlugins.Dir)
		if err != nil {
			return c, err
		}
		c.MuPluginsDir = &v
	}
	if f.Changed("app-code") {
		v := devEnvComponentDir(cmd, "app-code")
		c.AppCodeDir = &v
	} else if interactive {
		v, err := appctx.Input(cmd, "Path to local application code (blank for demo)", cur.AppCode.Dir)
		if err != nil {
			return c, err
		}
		c.AppCodeDir = &v
	}

	// Boolean service toggles — default to the current state.
	var err error
	if c.Elasticsearch, err = resolveUpdateBool(cmd, "elasticsearch", "Enable Elasticsearch (needed by Enterprise Search)?", rawTruthy(cur.Elasticsearch)); err != nil {
		return c, err
	}
	if c.PHPMyAdmin, err = resolveUpdateBool(cmd, "phpmyadmin", "Enable phpMyAdmin?", cur.PHPMyAdmin); err != nil {
		return c, err
	}
	if c.Xdebug, err = resolveUpdateBool(cmd, "xdebug", "Enable Xdebug?", cur.Xdebug); err != nil {
		return c, err
	}
	if c.Mailpit, err = resolveUpdateBool(cmd, "mailpit", "Enable Mailpit?", cur.Mailpit); err != nil {
		return c, err
	}
	if c.Photon, err = resolveUpdateBool(cmd, "photon", "Enable Photon?", cur.Photon); err != nil {
		return c, err
	}
	if c.Cron, err = resolveUpdateBool(cmd, "cron", "Enable cron?", cur.Cron); err != nil {
		return c, err
	}

	// xdebug_config — flag only (Node does not prompt for it).
	if f.Changed("xdebug_config") {
		v, _ := devEnvXdebugConfig(cmd)
		c.XdebugConfig = &v
	}

	// media-redirect-domain — default to the current value.
	if f.Changed("media-redirect-domain") {
		v, err := devEnvMediaRedirectDomain(cmd)
		if err != nil {
			return c, err
		}
		c.MediaDomain = &v
	} else if interactive {
		v, err := appctx.Input(cmd, "Redirect missing media to domain (blank to disable)", cur.MediaRedirectDomain)
		if err != nil {
			return c, err
		}
		c.MediaDomain = &v
	}

	return c, nil
}

// resolveUpdateBool returns the coerced y/n flag when set, else prompts
// (interactive, defaulting to current), else nil (leave unchanged).
func resolveUpdateBool(cmd *cobra.Command, name, prompt string, current bool) (*bool, error) {
	if cmd.Flags().Changed(name) {
		v := devEnvServiceFlag(cmd, name)
		return &v, nil
	}
	if appctx.IsInteractive(cmd) {
		v, err := appctx.Confirm(cmd, prompt, current)
		if err != nil {
			return nil, err
		}
		return &v, nil
	}
	return nil, nil
}

// currentPHPVersion extracts the bare PHP version from instance-data's php field,
// which may be a full image reference ("…/php-fpm:8.2") or a bare version.
func currentPHPVersion(cur *instancedata.InstanceData) string {
	if i := strings.LastIndex(cur.PHP, ":"); i >= 0 {
		return cur.PHP[i+1:]
	}
	return cur.PHP
}

// rawTruthy interprets a bool|string JSON union (e.g. elasticsearch) as a bool.
func rawTruthy(r json.RawMessage) bool {
	if len(r) == 0 {
		return false
	}
	var b bool
	if json.Unmarshal(r, &b) == nil {
		return b
	}
	var s string
	if json.Unmarshal(r, &s) == nil {
		return s != ""
	}
	return false
}

package devenv

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"

	"github.com/google/uuid"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/instancedata"
)

// passwordChars and passwordLength mirror Node's generatePassword
// (dev-environment-database.ts).
const passwordChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
const passwordLength = 12

// generatePassword returns a random 12-character admin password drawn from the
// same charset Node uses, via crypto/rand.
func generatePassword() string {
	b := make([]byte, passwordLength)
	max := big.NewInt(int64(len(passwordChars)))
	for i := range b {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			// crypto/rand failure is effectively fatal; fall back to a fixed
			// index so we never panic mid-create (vanishingly rare).
			b[i] = passwordChars[0]
			continue
		}
		b[i] = passwordChars[n.Int64()]
	}
	return string(b)
}

// CreateConfig is the fully-resolved create input (flags + prompt answers). The
// cobra layer (Plan 5) fills this from flags, prompting via internal/appctx for
// anything missing; this package only consumes the resolved struct so it stays
// unit-testable without a TTY.
type CreateConfig struct {
	Slug          string
	Title         string
	MultisiteMode string // "" (off), "subdomain", or "subdirectory"
	PHP           string
	WordPress     string
	MuPluginsDir  string // local path; "" => image mode
	AppCodeDir    string // local path; "" => demo/image mode
	Elasticsearch bool
	PHPMyAdmin    bool
	Mailpit       bool
	Xdebug        bool
	XdebugConfig  string
	Cron          bool
	Photon        bool
	MediaDomain   string
	Domain        string // custom domain; "" => compose.DefaultDomain (vipdev.site)
	Start         bool   // --start: run Start after a successful create
}

// buildInstanceData converts a resolved CreateConfig into InstanceData, setting
// Multisite explicitly (false or the mode string) — never nil (Node parity).
func buildInstanceData(c CreateConfig) *instancedata.InstanceData {
	domain := c.Domain
	if domain == "" {
		domain = compose.DefaultDomain
	}
	ms := json.RawMessage("false")
	switch c.MultisiteMode {
	case "subdomain":
		ms = json.RawMessage(`"subdomain"`)
	case "subdirectory":
		ms = json.RawMessage(`"subdirectory"`)
	}
	d := &instancedata.InstanceData{
		SiteSlug:            c.Slug,
		WPTitle:             c.Title,
		Multisite:           ms,
		PHP:                 c.PHP,
		WordPress:           instancedata.WordPressConfig{Mode: "image", Tag: c.WordPress},
		MuPlugins:           componentConfig(c.MuPluginsDir),
		AppCode:             componentConfig(c.AppCodeDir),
		PHPMyAdmin:          c.PHPMyAdmin,
		Mailpit:             c.Mailpit,
		Photon:              c.Photon,
		Xdebug:              c.Xdebug,
		XdebugConfig:        c.XdebugConfig,
		Cron:                c.Cron,
		MediaRedirectDomain: c.MediaDomain,
		Domain:              domain,
	}
	if c.Elasticsearch {
		d.Elasticsearch = json.RawMessage("true")
	}
	return d
}

func componentConfig(dir string) instancedata.ComponentConfig {
	if dir != "" {
		return instancedata.ComponentConfig{Mode: "local", Dir: dir}
	}
	return instancedata.ComponentConfig{Mode: "image"}
}

// writeNewEnv validates the slug is free, then writes instance-data + materializes
// the compose files. It does NOT start (the caller honors CreateConfig.Start).
func writeNewEnv(c CreateConfig) error {
	if c.Slug == "" {
		return fmt.Errorf("devenv: create requires a slug")
	}
	if instancedata.Exists(c.Slug) {
		return fmt.Errorf("devenv: environment %q already exists", c.Slug)
	}
	d := buildInstanceData(c)
	// Generate and persist credentials at create (Node parity): a random admin
	// password (vip-dev-env-create.js) and a UUID autologin key
	// (createEnvironment, dev-environment-core.ts). These feed the WordPress
	// install and the info table's LOGIN URL / DEFAULT PASSWORD rows.
	d.AdminPassword = generatePassword()
	d.AutologinKey = uuid.NewString()
	if err := instancedata.Write(c.Slug, d); err != nil {
		return err
	}
	view := compose.NewView(d, compose.Options{Domain: d.Domain})
	if _, err := Materialize(c.Slug, view); err != nil {
		return err
	}
	return nil
}

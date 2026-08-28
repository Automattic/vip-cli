package devenv

import (
	"context"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

// UpdateConfig carries only the fields the user chose to change. nil pointers
// mean "leave as-is" so an `update` with one flag doesn't reset everything.
type UpdateConfig struct {
	PHP           *string
	WordPress     *string
	MuPluginsDir  *string
	AppCodeDir    *string
	Elasticsearch *bool
	PHPMyAdmin    *bool
	Mailpit       *bool
	Xdebug        *bool
	XdebugConfig  *string
	Cron          *bool
	Photon        *bool
	MediaDomain   *string
}

// applyUpdate overlays the set fields of c onto d.
func applyUpdate(d *instancedata.InstanceData, c UpdateConfig) {
	if c.PHP != nil {
		d.PHP = *c.PHP
	}
	if c.WordPress != nil {
		d.WordPress.Mode = "image"
		d.WordPress.Tag = *c.WordPress
	}
	if c.MuPluginsDir != nil {
		d.MuPlugins = componentConfig(*c.MuPluginsDir)
	}
	if c.AppCodeDir != nil {
		d.AppCode = componentConfig(*c.AppCodeDir)
	}
	if c.Elasticsearch != nil {
		if *c.Elasticsearch {
			d.Elasticsearch = []byte("true")
		} else {
			d.Elasticsearch = []byte("false")
		}
	}
	if c.PHPMyAdmin != nil {
		d.PHPMyAdmin = *c.PHPMyAdmin
	}
	if c.Mailpit != nil {
		d.Mailpit = *c.Mailpit
	}
	if c.Xdebug != nil {
		d.Xdebug = *c.Xdebug
	}
	if c.XdebugConfig != nil {
		d.XdebugConfig = *c.XdebugConfig
	}
	if c.Cron != nil {
		d.Cron = *c.Cron
	}
	if c.Photon != nil {
		d.Photon = *c.Photon
	}
	if c.MediaDomain != nil {
		d.MediaRedirectDomain = *c.MediaDomain
	}
}

// Update reads, overlays, re-materializes, and persists an env's instance data.
// Like Node it does NOT restart — the caller instructs the user to start again.
func Update(ctx context.Context, slug string, c UpdateConfig) error {
	d, err := instancedata.Read(slug)
	if err != nil {
		return err
	}
	applyUpdate(d, c)
	if err := instancedata.Write(slug, d); err != nil {
		return err
	}
	view := viewForData(d)
	_, err = Materialize(slug, view)
	return err
}

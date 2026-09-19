package compose

import (
	"encoding/json"
	"testing"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

func TestNewViewInterpretsMultisiteAndDefaults(t *testing.T) {
	data := &instancedata.InstanceData{
		SiteSlug:  "example",
		WPTitle:   "Example",
		Multisite: json.RawMessage("false"),
		WordPress: instancedata.WordPressConfig{Mode: "image", Tag: "trunk"},
		MuPlugins: instancedata.ComponentConfig{Mode: "image"},
		AppCode:   instancedata.ComponentConfig{Mode: "local", Dir: "/srv/example"},
		PHP:       "ghcr.io/automattic/vip-container-images/php-fpm:8.2",
	}
	v := NewView(data, Options{})

	if v.SiteSlug != "example" {
		t.Fatalf("SiteSlug = %q", v.SiteSlug)
	}
	if v.Domain != DefaultDomain {
		t.Fatalf("default Domain = %q, want DefaultDomain %q", v.Domain, DefaultDomain)
	}
	if v.MultisiteEnabled {
		t.Fatalf("multisite should be disabled for false")
	}
	if v.AdminPassword != "password" {
		t.Fatalf("default AdminPassword = %q, want password", v.AdminPassword)
	}
	if !v.AppCodeLocal || v.AppCodeDir != "/srv/example" {
		t.Fatalf("appCode local/dir wrong: %+v", v)
	}
	if v.MuPluginsLocal {
		t.Fatalf("muPlugins should be image mode")
	}
	if v.DatabaseImage != "mysql:8.4" {
		t.Fatalf("default db image = %q, want mysql:8.4", v.DatabaseImage)
	}
}

func TestNewViewSubdomainMultisite(t *testing.T) {
	data := &instancedata.InstanceData{
		SiteSlug:  "ms",
		Multisite: json.RawMessage(`"subdomain"`),
		WordPress: instancedata.WordPressConfig{Mode: "image", Tag: "trunk"},
		MariaDB:   "10.11",
	}
	v := NewView(data, Options{})
	if !v.MultisiteEnabled || !v.MultisiteSubdomain {
		t.Fatalf("expected subdomain multisite enabled: %+v", v)
	}
	if v.DatabaseImage != "mariadb:10.11" {
		t.Fatalf("mariadb image = %q", v.DatabaseImage)
	}
}

// TestNewViewBoolTrueMultisite locks the parity-critical branch: a bool `true`
// multisite must enable subdomain routing (EJS `multisite === true` => --subdomain).
func TestNewViewBoolTrueMultisite(t *testing.T) {
	data := &instancedata.InstanceData{
		SiteSlug:  "ms2",
		Multisite: json.RawMessage("true"),
		WordPress: instancedata.WordPressConfig{Mode: "image", Tag: "trunk"},
	}
	v := NewView(data, Options{})
	if !v.MultisiteEnabled || !v.MultisiteSubdomain {
		t.Fatalf("bool true multisite should be enabled+subdomain: %+v", v)
	}
}

func TestNewViewCopiesEnvVars(t *testing.T) {
	d := &instancedata.InstanceData{SiteSlug: "e", Multisite: json.RawMessage("false"), EnvVars: map[string]string{"A": "1"}}
	v := NewView(d, Options{})
	if v.EnvVars["A"] != "1" {
		t.Fatalf("NewView did not copy EnvVars: %+v", v.EnvVars)
	}
}

// TestNewViewSubdirectoryMultisite: a non-subdomain string enables multisite
// but NOT subdomain routing.
func TestNewViewSubdirectoryMultisite(t *testing.T) {
	data := &instancedata.InstanceData{
		SiteSlug:  "ms3",
		Multisite: json.RawMessage(`"subdirectory"`),
		WordPress: instancedata.WordPressConfig{Mode: "image", Tag: "trunk"},
	}
	v := NewView(data, Options{})
	if !v.MultisiteEnabled {
		t.Fatalf("subdirectory multisite should be enabled: %+v", v)
	}
	if v.MultisiteSubdomain {
		t.Fatalf("subdirectory multisite must NOT be subdomain: %+v", v)
	}
}

func TestDefaultDomainIsVipdevSite(t *testing.T) {
	if DefaultDomain != "vipdev.site" {
		t.Fatalf("DefaultDomain = %q, want vipdev.site", DefaultDomain)
	}
}

func TestNewViewResolvesPHPImage(t *testing.T) {
	base := func(php string) *instancedata.InstanceData {
		return &instancedata.InstanceData{SiteSlug: "e", Multisite: json.RawMessage("false"), PHP: php}
	}
	cases := []struct{ php, want string }{
		{"", "ghcr.io/automattic/vip-container-images/php-fpm:8.2"},                                                    // empty -> recommended default
		{"8.4", "ghcr.io/automattic/vip-container-images/php-fpm:8.4"},                                                 // bare version -> mapped image
		{"ghcr.io/automattic/vip-container-images/php-fpm:8.3", "ghcr.io/automattic/vip-container-images/php-fpm:8.3"}, // explicit image -> as-is
	}
	for _, c := range cases {
		if got := NewView(base(c.php), Options{}).PHPImage; got != c.want {
			t.Errorf("phpImage(%q) => %q, want %q", c.php, got, c.want)
		}
	}
}

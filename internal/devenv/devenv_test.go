package devenv

import (
	"testing"

	"github.com/Automattic/vip/internal/devenv/compose"
)

// TestEnvHostsDefaultDomainIncluded verifies that default-domain envs (vipdev.site)
// DO get a managed hosts block entry now — previously default-domain envs were
// excluded and relied solely on the public *.vipdev.site wildcard (which resolves
// to 127.0.0.1 online). The managed block is the OFFLINE supplement, so every env
// needs it regardless of domain.
func TestEnvHostsDefaultDomainIncluded(t *testing.T) {
	got := envHosts(compose.View{SiteSlug: "example", Domain: compose.DefaultDomain}, nil)
	if len(got) == 0 {
		t.Fatalf("expected at least one hosts entry for default domain %q, got none", compose.DefaultDomain)
	}
	if got[0] != "example."+compose.DefaultDomain {
		t.Fatalf("first entry = %q, want %q", got[0], "example."+compose.DefaultDomain)
	}
}

func TestEnvHostsCustomDomain(t *testing.T) {
	v := compose.View{SiteSlug: "example", Domain: "mysite.test", PHPMyAdmin: true, Mailpit: true}
	got := envHosts(v, nil)
	want := map[string]bool{
		"example.mysite.test":         true,
		"example-pma.mysite.test":     true,
		"example-mailpit.mysite.test": true,
	}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for _, h := range got {
		if !want[h] {
			t.Fatalf("unexpected host %q in %v", h, got)
		}
	}
}

func TestEnvHostsForDefaultDomain(t *testing.T) {
	v := compose.View{SiteSlug: "demo", Domain: "vipdev.site", PHPMyAdmin: true, Mailpit: true}
	got := envHosts(v, nil)
	want := map[string]bool{
		"demo.vipdev.site":         true,
		"demo-pma.vipdev.site":     true,
		"demo-mailpit.vipdev.site": true,
	}
	if len(got) != len(want) {
		t.Fatalf("envHosts = %v, want keys %v", got, want)
	}
	for _, h := range got {
		if !want[h] {
			t.Fatalf("unexpected host %q in %v", h, got)
		}
	}
}

func TestEnvHostsOmitsDisabledServices(t *testing.T) {
	v := compose.View{SiteSlug: "demo", Domain: "vipdev.site"} // no pma/mailpit
	got := envHosts(v, nil)
	if len(got) != 1 || got[0] != "demo.vipdev.site" {
		t.Fatalf("envHosts = %v, want only demo.vipdev.site", got)
	}
}

func TestInitServicesImageVsLocal(t *testing.T) {
	full := initServices(compose.View{}) // image mode for both
	if len(full) < 1 {
		t.Fatal("expected at least the wordpress init service")
	}
	local := initServices(compose.View{MuPluginsLocal: true, AppCodeLocal: true})
	if len(local) != 1 {
		t.Fatalf("local mu-plugins+app-code should leave only the wordpress init service, got %v", local)
	}
}

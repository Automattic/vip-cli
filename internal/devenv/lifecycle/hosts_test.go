package lifecycle

import (
	"testing"

	"github.com/Automattic/vip/internal/devenv/compose"
)

func TestSubsiteHostsFiltersToEnvSuffix(t *testing.T) {
	v := compose.View{SiteSlug: "net", Domain: "vipdev.site"}
	in := []string{
		"net.vipdev.site",          // main site (no leading subdomain) -> excluded
		"sub1.net.vipdev.site",     // real subsite -> kept
		"sub2.net.vipdev.site",     // real subsite -> kept
		"deep.sub.net.vipdev.site", // current router/TLS only covers one label -> dropped
		"evil.example.com",         // foreign/production -> dropped
		"net.vipdev.site.evil.com", // suffix trick -> dropped
		"evilnet.vipdev.site",      // missing label boundary -> dropped
	}
	got := SubsiteHosts(in, v)
	want := []string{"sub1.net.vipdev.site", "sub2.net.vipdev.site"}
	if len(got) != len(want) {
		t.Fatalf("subsiteHosts = %v, want %v", got, want)
	}
	seen := map[string]bool{}
	for _, h := range got {
		seen[h] = true
	}
	for _, w := range want {
		if !seen[w] {
			t.Fatalf("missing %q in %v", w, got)
		}
	}
}

func TestDedupHosts(t *testing.T) {
	got := dedupHosts([]string{"a", "b", "a", "c", "b"})
	if len(got) != 3 {
		t.Fatalf("dedupHosts = %v, want 3 unique", got)
	}
}

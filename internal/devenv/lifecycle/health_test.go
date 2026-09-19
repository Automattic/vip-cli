package lifecycle

import (
	"testing"

	"github.com/Automattic/vip/internal/devenv/proxy"
)

func TestSiteURLUsesBoundHTTPSPort(t *testing.T) {
	if got := SiteURL("example", "vipdev.lndo.site", proxy.Ports{HTTP: 80, HTTPS: 443}); got != "https://example.vipdev.lndo.site/" {
		t.Fatalf("443 should be portless: %q", got)
	}
	if got := SiteURL("example", "vipdev.lndo.site", proxy.Ports{HTTP: 8000, HTTPS: 4444}); got != "https://example.vipdev.lndo.site:4444/" {
		t.Fatalf("fallback port must appear: %q", got)
	}
}

type fakeProber struct {
	codes map[string]int
}

func (f *fakeProber) Probe(url string) (int, error) { return f.codes[url], nil }

func TestHealthProbesSiteURL(t *testing.T) {
	url := "https://example.vipdev.lndo.site/"
	p := &fakeProber{codes: map[string]int{url: 200}}
	ok, err := Healthy(p, "example", "vipdev.lndo.site", proxy.Ports{HTTP: 80, HTTPS: 443})
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected healthy when site returns 200")
	}
}

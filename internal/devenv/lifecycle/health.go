package lifecycle

import (
	"fmt"

	"github.com/Automattic/vip/internal/devenv/proxy"
)

// SiteURL builds the front-end HTTPS URL, including the bound https port only
// when it is not the default 443 (the place Lando drifts: printed URL vs bound
// port).
func SiteURL(slug, domain string, ports proxy.Ports) string {
	host := slug + "." + domain
	if ports.HTTPS == 443 {
		return "https://" + host + "/"
	}
	return fmt.Sprintf("https://%s:%d/", host, ports.HTTPS)
}

// Healthy probes the site URL and reports whether it returned a non-5xx, non-0
// status (the env is up and routing). Network errors are returned.
func Healthy(p Prober, slug, domain string, ports proxy.Ports) (bool, error) {
	code, err := p.Probe(SiteURL(slug, domain, ports))
	if err != nil {
		return false, err
	}
	return code >= 200 && code < 500, nil
}

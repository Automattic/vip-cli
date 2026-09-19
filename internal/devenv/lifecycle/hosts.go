package lifecycle

import (
	"strings"

	"github.com/Automattic/vip/internal/devenv/compose"
)

// SubsiteHosts keeps only the discovered domains that are real subdomain-multisite
// subsites of THIS env — i.e. end in ".<slug>.<domain>" (a label in front of the
// env's own host). The env's main host and any foreign/production domains (e.g.
// from a DB imported without search-replace) are dropped, so we never write a
// host we don't own into the hosts file. Only one label is accepted because the
// current Traefik rule and certificate wildcard do not cover deeper names.
func SubsiteHosts(domains []string, v compose.View) []string {
	suffix := "." + v.SiteSlug + "." + v.Domain
	var out []string
	for _, d := range domains {
		d = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(d)), ".")
		if d == "" || !strings.HasSuffix(d, suffix) {
			continue
		}
		prefix := strings.TrimSuffix(d, suffix)
		if prefix != "" && !strings.Contains(prefix, ".") {
			out = append(out, d)
		}
	}
	return out
}

// dedupHosts returns hosts with duplicates removed, preserving first-seen order.
func dedupHosts(hosts []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, h := range hosts {
		if !seen[h] {
			seen[h] = true
			out = append(out, h)
		}
	}
	return out
}

package compose

import (
	"strings"
	"testing"
)

func TestNginxLabelsSingleSite(t *testing.T) {
	v := baseView() // single site
	labels := nginxLabels(v)
	host := "example.vipdev.lndo.site"
	if !labelValueContains(labels, "rule", host) {
		t.Fatalf("no router rule for %s in %v", host, labels)
	}
	if !anyLabelKeyContains(labels, "-secured") || !anyLabelKeyContains(labels, ".tls") {
		t.Fatalf("expected an https/tls router: %v", labels)
	}
	// nginx listens on 80 (not 8080); routing Traefik elsewhere yields a 502.
	if !labelValueContains(labels, "loadbalancer.server.port", "80") {
		t.Fatalf("expected nginx lb port 80: %v", labels)
	}
}

func TestNginxLabelsMultisiteWildcard(t *testing.T) {
	v := baseView()
	v.MultisiteEnabled = true
	labels := nginxLabels(v)
	if !anyLabelValueContains(labels, "[a-z0-9-]+") {
		t.Fatalf("expected wildcard regex in multisite rule: %v", labels)
	}
}

func TestCertSANsIncludeEnabledServices(t *testing.T) {
	v := baseView()
	v.PHPMyAdmin = true
	v.Mailpit = true
	sans := CertSANs(v)
	joined := strings.Join(sans, ",")
	for _, want := range []string{"example.vipdev.lndo.site", "example-pma.vipdev.lndo.site", "example-mailpit.vipdev.lndo.site"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("SANs missing %q: %v", want, sans)
		}
	}
}

func TestCertSANsIncludesBaseDomainWildcard(t *testing.T) {
	sans := CertSANs(baseView())
	found := false
	for _, s := range sans {
		if s == "*.vipdev.lndo.site" {
			found = true
		}
	}
	if !found {
		t.Fatalf("CertSANs must include the base-domain wildcard *.vipdev.lndo.site (Lando-style subdomain cert): %v", sans)
	}
}

func TestCertSANsCoversMultisiteWildcard(t *testing.T) {
	v := baseView()
	v.MultisiteEnabled = true
	sans := CertSANs(v)
	var hasBase, hasWild bool
	for _, s := range sans {
		if s == "example.vipdev.lndo.site" {
			hasBase = true
		}
		if s == "*.example.vipdev.lndo.site" {
			hasWild = true
		}
	}
	if !hasBase {
		t.Fatalf("CertSANs missing base host: %v", sans)
	}
	if !hasWild {
		t.Fatalf("CertSANs missing multisite wildcard *.example.vipdev.lndo.site (the multisite secured router needs it): %v", sans)
	}
}

// TestEveryRouterServicePointerHasDefinition is a structural invariant: every
// traefik router's .service value must reference a service that actually has a
// loadbalancer.server.port definition. A mismatch (e.g. a double "-secured"
// suffix) means Traefik silently drops that route. Checked across nginx (which
// emits the most routers, incl. the multisite wildcard), pma and mailpit.
func TestEveryRouterServicePointerHasDefinition(t *testing.T) {
	v := baseView()
	v.MultisiteEnabled = true
	for name, labels := range map[string]map[string]string{
		"nginx":   nginxLabels(v),
		"pma":     phpMyAdminLabels(v),
		"mailpit": mailpitLabels(v),
	} {
		defined := map[string]bool{}
		for k := range labels {
			const pre, suf = "traefik.http.services.", ".loadbalancer.server.port"
			if strings.HasPrefix(k, pre) && strings.HasSuffix(k, suf) {
				defined[strings.TrimSuffix(strings.TrimPrefix(k, pre), suf)] = true
			}
		}
		for k, val := range labels {
			if strings.HasPrefix(k, "traefik.http.routers.") && strings.HasSuffix(k, ".service") {
				if !defined[val] {
					t.Fatalf("[%s] router %s points at undefined service %q; defined=%v", name, k, val, defined)
				}
			}
			if strings.Contains(k, "-secured-secured") {
				t.Fatalf("[%s] malformed double-secured key: %s", name, k)
			}
		}
	}
}

func labelValueContains(labels map[string]string, keySub, valSub string) bool {
	for k, val := range labels {
		if strings.Contains(k, keySub) && strings.Contains(val, valSub) {
			return true
		}
	}
	return false
}
func anyLabelKeyContains(labels map[string]string, sub string) bool {
	for k := range labels {
		if strings.Contains(k, sub) {
			return true
		}
	}
	return false
}
func anyLabelValueContains(labels map[string]string, sub string) bool {
	for _, val := range labels {
		if strings.Contains(val, sub) {
			return true
		}
	}
	return false
}

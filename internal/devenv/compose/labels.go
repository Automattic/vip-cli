package compose

import (
	"fmt"
	"strings"
)

// hostRule builds a Traefik HostRegexp rule for a hostname, converting a "*"
// wildcard to the [a-z0-9-]+ class (ports lando-proxy/lib/utils.js getRule).
func hostRule(host string) string {
	re := strings.ReplaceAll(host, "*", "[a-z0-9-]+")
	return fmt.Sprintf("HostRegexp(`%s`)", re)
}

// routerLabels emits an http router + a tls (secured) router for one routed
// hostname pattern on a given service port, all prefixed by id.
func routerLabels(id, rule string, port int, labels map[string]string) {
	labels[fmt.Sprintf("traefik.http.routers.%s.entrypoints", id)] = "http"
	labels[fmt.Sprintf("traefik.http.routers.%s.rule", id)] = rule
	labels[fmt.Sprintf("traefik.http.routers.%s.service", id)] = id + "-service"
	labels[fmt.Sprintf("traefik.http.services.%s-service.loadbalancer.server.port", id)] = fmt.Sprintf("%d", port)

	sec := id + "-secured"
	labels[fmt.Sprintf("traefik.http.routers.%s.entrypoints", sec)] = "https"
	labels[fmt.Sprintf("traefik.http.routers.%s.rule", sec)] = rule
	labels[fmt.Sprintf("traefik.http.routers.%s.tls", sec)] = "true"
	labels[fmt.Sprintf("traefik.http.routers.%s.service", sec)] = sec + "-service"
	// Build the secured service key from id (not sec) so it resolves to
	// "<id>-secured-service" — matching the router .service pointer above and
	// Node's ${rule.id}-secured-service (utils.js:205). Using sec here would
	// yield "<id>-secured-secured-service" and silently break TLS routing.
	labels[fmt.Sprintf("traefik.http.services.%s-secured-service.loadbalancer.server.port", id)] = fmt.Sprintf("%d", port)
}

// nginxLabels routes the front-end hostname(s) to the nginx service, adding the
// multisite wildcard host when enabled. The nginx image listens on port 80 (its
// listen directive + the EJS proxy entry, which has no explicit port → Lando's
// default 80); routing Traefik to 8080 yields a 502 since nothing listens there.
func nginxLabels(v View) map[string]string {
	labels := map[string]string{"traefik.enable": "true"}
	base := v.SiteSlug + "." + v.Domain
	routerLabels("nginx-"+v.SiteSlug, hostRule(base), 80, labels)
	if v.MultisiteEnabled {
		routerLabels("nginx-"+v.SiteSlug+"-wild", hostRule("*."+base), 80, labels)
	}
	return labels
}

// phpMyAdminLabels routes <slug>-pma.<domain> to phpmyadmin (port 80).
func phpMyAdminLabels(v View) map[string]string {
	labels := map[string]string{"traefik.enable": "true"}
	routerLabels("pma-"+v.SiteSlug, hostRule(v.SiteSlug+"-pma."+v.Domain), 80, labels)
	return labels
}

// mailpitLabels routes <slug>-mailpit.<domain> to mailpit (port 8025).
func mailpitLabels(v View) map[string]string {
	labels := map[string]string{"traefik.enable": "true"}
	routerLabels("mailpit-"+v.SiteSlug, hostRule(v.SiteSlug+"-mailpit."+v.Domain), 8025, labels)
	return labels
}

// CertSANs returns the hostnames needing a TLS cert for this environment — the
// set that gets secured (https/tls) Traefik routers above. These SANs are the
// single source of truth for the env's edge certificate: the proxy package
// generates one leaf cert covering them centrally (proxy.EnsureCert), because
// the traefik_openssl image runs no in-service cert machinery (Task 1 findings).
// Consequently the app services carry no cert env or certs volume — TLS
// terminates at the Traefik edge using the file-provider cert built from this list.
func CertSANs(v View) []string {
	// Lead with a base-domain wildcard (like Lando's *.lndo.site) so the cert
	// covers this env's host AND any one-label subdomain of the base domain —
	// every <slug>.<domain>, the -pma/-mailpit hosts, and sibling envs — without
	// per-host SANs. The explicit hosts below remain for clarity/exactness, and
	// the deeper multisite wildcard (two labels) is still added separately.
	sans := []string{
		"*." + v.Domain,
		v.SiteSlug + "." + v.Domain,
	}
	if v.MultisiteEnabled {
		sans = append(sans, "*."+v.SiteSlug+"."+v.Domain)
	}
	if v.PHPMyAdmin {
		sans = append(sans, v.SiteSlug+"-pma."+v.Domain)
	}
	if v.Mailpit {
		sans = append(sans, v.SiteSlug+"-mailpit."+v.Domain)
	}
	return sans
}

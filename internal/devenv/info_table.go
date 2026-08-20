package devenv

import (
	"fmt"
	"sort"
	"strings"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/lifecycle"
	"github.com/Automattic/vip/internal/devenv/paths"
	"github.com/Automattic/vip/internal/devenv/proxy"
)

// documentationURL is the docs link Node prints in the info table
// (dev-environment-lando.ts:703).
const documentationURL = "https://docs.wpvip.com/vip-local-development-environment/"

// serviceOrder is the canonical SERVICES ordering Node displays; services not
// listed here are appended alphabetically.
var serviceOrder = []string{
	"nginx", "php", "database", "memcached", "wordpress",
	"vip-mu-plugins", "demo-app-code", "elasticsearch", "phpmyadmin", "mailpit", "photon",
}

// renderEnvInfo builds the full Node-parity info table for an environment. It is
// pure given the resolved view + the proxy ports + the container states, so the
// docker-touching gather lives in Info() and the formatting stays unit-testable.
func renderEnvInfo(slug string, view compose.View, ports proxy.Ports, states []lifecycle.ServiceState) string {
	return renderInfoTable(buildInfoRows(slug, view, ports, states))
}

func buildInfoRows(slug string, view compose.View, ports proxy.Ports, states []lifecycle.ServiceState) []infoRow {
	host := view.SiteSlug + "." + view.Domain
	httpURL := frontURL("http", host, ports.HTTP, proxy.DefaultHTTP)
	httpsURL := frontURL("https", host, ports.HTTPS, proxy.DefaultHTTPS)

	rows := []infoRow{
		{label: "SLUG", values: []string{slug}},
		{label: "LOCATION", values: []string{paths.EnvironmentPath(slug)}},
		{label: "SERVICES", values: []string{strings.Join(servicesList(view), ", ")}},
		{label: "NGINX URLS", values: []string{httpURL, httpsURL}},
		{label: "STATUS", values: []string{statusFromStates(states)}},
	}

	// Login + credentials. Node prints these whenever the front-end URL is
	// configured (always), regardless of running state. The autologin query is
	// appended only when a key is present. NOTE: unlike Node — which reuses the
	// HTTP port for the HTTPS login URL (a Lando quirk) — we use the correct
	// per-scheme port so both login URLs actually load.
	loginQuery := ""
	if view.AutologinKey != "" {
		loginQuery = "?vip-dev-autologin=" + view.AutologinKey
	}
	httpsLogin := httpsURL + "wp-admin/" + loginQuery
	httpLogin := httpURL + "wp-admin/" + loginQuery
	rows = append(rows,
		infoRow{label: "LOGIN URL", values: []string{httpsLogin, httpLogin}},
		infoRow{label: "DEFAULT USERNAME", values: []string{"vipgo"}},
		infoRow{label: "DEFAULT PASSWORD", values: []string{view.AdminPassword}},
		infoRow{label: "DOCUMENTATION", values: []string{documentationURL}},
	)
	if view.MigratedFromLando != "" {
		rows = append(rows, infoRow{label: "MIGRATED FROM LANDO", values: []string{view.MigratedFromLando}})
	}
	return rows
}

// frontURL renders "scheme://host[:port]/", omitting the port when it is the
// scheme's default.
func frontURL(scheme, host string, port, defaultPort int) string {
	if port == 0 || port == defaultPort {
		return fmt.Sprintf("%s://%s/", scheme, host)
	}
	return fmt.Sprintf("%s://%s:%d/", scheme, host, port)
}

// servicesList returns the env's configured service names in canonical order
// (derived from the compose project, so it reflects enabled conditional
// services and does not depend on anything running).
func servicesList(v compose.View) []string {
	present := map[string]bool{}
	for name := range compose.BuildProject(v).Services {
		present[name] = true
	}
	var out []string
	for _, n := range serviceOrder {
		if present[n] {
			out = append(out, n)
			delete(present, n)
		}
	}
	leftover := make([]string, 0, len(present))
	for n := range present {
		leftover = append(leftover, n)
	}
	sort.Strings(leftover)
	return append(out, leftover...)
}

// statusFromStates derives the env status from container states: UP when nginx
// is running, PARTIALLY UP when some other service is running, else DOWN.
func statusFromStates(states []lifecycle.ServiceState) string {
	nginxUp, anyUp := false, false
	for _, s := range states {
		if s.State == "running" {
			anyUp = true
			if s.Service == "nginx" {
				nginxUp = true
			}
		}
	}
	switch {
	case nginxUp:
		return "UP"
	case anyUp:
		return "PARTIALLY UP"
	default:
		return "DOWN"
	}
}

// infoRow is one label/value(s) row of the dev-env info table. A row with no
// values is omitted (e.g. LOGIN URL when the env is not running).
type infoRow struct {
	label  string
	values []string
}

// renderInfoTable renders the borderless, padded two-column table Node prints
// after create/start and for `dev-env info` (ports getLandoFormatters table:
// dev-environment-cli.ts printTable). Each row is " <LABEL>  <value>" with the
// label column padded to the longest label; multi-line values align under the
// first value.
func renderInfoTable(rows []infoRow) string {
	labelWidth := 0
	for _, r := range rows {
		if len(r.values) == 0 {
			continue
		}
		if len(r.label) > labelWidth {
			labelWidth = len(r.label)
		}
	}
	// 1 leading space + label column + 2 trailing spaces before the value.
	indent := strings.Repeat(" ", 1+labelWidth+2)

	var b strings.Builder
	for _, r := range rows {
		if len(r.values) == 0 {
			continue
		}
		b.WriteByte(' ')
		b.WriteString(r.label)
		b.WriteString(strings.Repeat(" ", labelWidth-len(r.label)))
		b.WriteString("  ")
		b.WriteString(r.values[0])
		b.WriteByte('\n')
		for _, v := range r.values[1:] {
			b.WriteString(indent)
			b.WriteString(v)
			b.WriteByte('\n')
		}
	}
	return b.String()
}

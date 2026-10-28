package devenv

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/devenv/proxy"
)

func TestInfoServiceConnections(t *testing.T) {
	body, err := os.ReadFile("../../testdata/parity/devenv-info-services.json")
	if err != nil {
		t.Fatal(err)
	}
	var states []dockercli.ServiceState
	if err := json.Unmarshal(body, &states); err != nil {
		t.Fatal(err)
	}
	view := compose.View{SiteSlug: "demo", Domain: "vipdev.site", PHPMyAdmin: true, Mailpit: true, Elasticsearch: true, Photon: true}
	rows := buildInfoRows("demo", view, proxy.Ports{HTTP: 8000, HTTPS: 444}, states)
	got := map[string][]string{}
	for _, row := range rows {
		got[row.label] = row.values
	}
	for label, want := range map[string][]string{
		"PHPMYADMIN URLS":   {"http://localhost:49155", "http://demo-pma.vipdev.site:8000/", "https://demo-pma.vipdev.site:444/"},
		"MAILPIT URLS":      {"http://demo-mailpit.vipdev.site:8000/", "https://demo-mailpit.vipdev.site:444/"},
		"DATABASE":          {"127.0.0.1:49153, [::]:49153"},
		"ENTERPRISE SEARCH": {"http://127.0.0.1:49154, http://[::]:49154"},
	} {
		if !reflect.DeepEqual(got[label], want) {
			t.Errorf("%s: got %v, want %v", label, got[label], want)
		}
	}
	for _, label := range []string{"PHOTON URLS", "PHOTON", "MAILPIT", "PHPMYADMIN"} {
		if _, ok := got[label]; ok {
			t.Errorf("unexpected connection row %s", label)
		}
	}
}

func TestInfoServiceConnectionsStoppedAndDisabled(t *testing.T) {
	view := compose.View{SiteSlug: "demo", Domain: "vipdev.site", PHPMyAdmin: true, Mailpit: true}
	// Stopped services keep their configured proxy URLs, but never stale bindings.
	states := []dockercli.ServiceState{{Service: "database", State: "exited", Publishers: []dockercli.PortPublisher{{URL: "127.0.0.1", TargetPort: 3306, PublishedPort: 49153, Protocol: "tcp"}}}}
	got := renderEnvInfo("demo", view, proxy.Ports{}, states)
	for _, url := range []string{"http://demo-pma.vipdev.site/", "https://demo-pma.vipdev.site/", "http://demo-mailpit.vipdev.site/", "https://demo-mailpit.vipdev.site/"} {
		if !strings.Contains(got, url) {
			t.Errorf("missing stopped service URL %s", url)
		}
	}
	if strings.Contains(got, "49153") {
		t.Fatal("stopped service advertised a host binding")
	}
	view.PHPMyAdmin, view.Mailpit = false, false
	got = renderEnvInfo("demo", view, proxy.Ports{}, nil)
	if strings.Contains(got, "PHPMYADMIN URLS") || strings.Contains(got, "MAILPIT URLS") || strings.Contains(got, "ENTERPRISE SEARCH") {
		t.Fatal("disabled service advertised a connection")
	}
}

func TestBuildInfoRowsShowsLandoMigrationMarker(t *testing.T) {
	v := compose.View{SiteSlug: "foo", Domain: "vipdev.site", AdminPassword: "password", MigratedFromLando: "2026-07-10T00:00:00Z"}
	rows := buildInfoRows("foo", v, proxy.Ports{}, nil)
	found := false
	for _, r := range rows {
		if r.label == "MIGRATED FROM LANDO" && len(r.values) == 1 && r.values[0] == "2026-07-10T00:00:00Z" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a MIGRATED FROM LANDO row, got %+v", rows)
	}
}

func TestBuildInfoRowsOmitsMarkerWhenEmpty(t *testing.T) {
	v := compose.View{SiteSlug: "foo", Domain: "vipdev.site", AdminPassword: "password"}
	for _, r := range buildInfoRows("foo", v, proxy.Ports{}, nil) {
		if r.label == "MIGRATED FROM LANDO" {
			t.Fatal("marker row must be omitted when unset")
		}
	}
}

func TestRenderInfoTablePadsToLongestLabel(t *testing.T) {
	rows := []infoRow{
		{label: "SLUG", values: []string{"demo"}},
		{label: "NGINX URLS", values: []string{"http://a/", "https://a/"}},
		{label: "DEFAULT USERNAME", values: []string{"vipgo"}},
	}
	got := renderInfoTable(rows)
	want := " SLUG              demo\n" +
		" NGINX URLS        http://a/\n" +
		"                   https://a/\n" +
		" DEFAULT USERNAME  vipgo\n"
	if got != want {
		t.Fatalf("renderInfoTable mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestRenderEnvInfoRunningEnv(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	view := compose.View{SiteSlug: "demo", Domain: "vipdev.lndo.site", AutologinKey: "KEY-123", AdminPassword: "pw_secret12"}
	ports := proxy.Ports{HTTP: 8000, HTTPS: 444}
	states := []dockercli.ServiceState{{Service: "nginx", State: "running"}, {Service: "php", State: "running"}}

	got := renderEnvInfo("demo", view, ports, states)

	wants := []string{
		" SLUG",
		"demo",
		"SERVICES",
		"nginx, php, database, memcached, wordpress, vip-mu-plugins, demo-app-code",
		"http://demo.vipdev.lndo.site:8000/",
		"https://demo.vipdev.lndo.site:444/",
		" STATUS",
		"UP",
		"https://demo.vipdev.lndo.site:444/wp-admin/?vip-dev-autologin=KEY-123",
		"http://demo.vipdev.lndo.site:8000/wp-admin/?vip-dev-autologin=KEY-123",
		"DEFAULT USERNAME",
		"vipgo",
		"DEFAULT PASSWORD",
		"pw_secret12",
		"https://docs.wpvip.com/vip-local-development-environment/",
	}
	for _, w := range wants {
		if !strings.Contains(got, w) {
			t.Fatalf("info table missing %q:\n%s", w, got)
		}
	}
}

func TestRenderEnvInfoStoppedEnvShowsDown(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	view := compose.View{SiteSlug: "demo", Domain: "vipdev.lndo.site", AutologinKey: "K", AdminPassword: "password"}
	got := renderEnvInfo("demo", view, proxy.Ports{HTTP: 80, HTTPS: 443}, nil)

	if !strings.Contains(got, "DOWN") {
		t.Fatalf("expected STATUS DOWN for stopped env:\n%s", got)
	}
	// Default ports are omitted from the URL (no :80 / :443).
	if !strings.Contains(got, "http://demo.vipdev.lndo.site/") {
		t.Fatalf("expected default-port URL without :80:\n%s", got)
	}
	// Login/credential rows are shown even when down (Node parity).
	if !strings.Contains(got, "DEFAULT USERNAME") {
		t.Fatalf("expected login rows present when down:\n%s", got)
	}
}

func TestRenderInfoTableSkipsRowsWithNoValues(t *testing.T) {
	rows := []infoRow{
		{label: "SLUG", values: []string{"demo"}},
		{label: "LOGIN URL", values: nil}, // env not running: omit
	}
	got := renderInfoTable(rows)
	want := " SLUG  demo\n"
	if got != want {
		t.Fatalf("expected empty-value row omitted:\n%q", got)
	}
}

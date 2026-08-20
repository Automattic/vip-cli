package compose

import "testing"

func TestBuildProjectAlwaysOnServices(t *testing.T) {
	v := baseView()
	p := BuildProject(v)
	for _, name := range []string{"database", "memcached", "php", "nginx", "wordpress"} {
		if _, ok := p.Services[name]; !ok {
			t.Fatalf("missing always-on service %q", name)
		}
	}
	if p.Services["nginx"].Labels["traefik.enable"] != "true" {
		t.Fatalf("nginx missing traefik labels")
	}
	if p.Name != "example" {
		t.Fatalf("project name = %q, want example (bare slug, must match -p)", p.Name)
	}
	if p.Networks[ProxyNetwork] == nil || !p.Networks[ProxyNetwork].External {
		t.Fatalf("proxy network not declared external: %+v", p.Networks)
	}
	if p.Volumes["mu-plugins"] == nil {
		t.Fatalf("mu-plugins volume not declared in image mode")
	}
	if p.Volumes["clientcode_themes"] == nil {
		t.Fatalf("clientcode_themes volume not declared in image mode")
	}
	if p.Volumes["database_data"] == nil {
		t.Fatalf("database_data volume missing")
	}
}

func TestBuildProjectConditionalServices(t *testing.T) {
	v := baseView()
	v.PHPMyAdmin = true
	v.Elasticsearch = true
	v.Mailpit = true
	v.Photon = true
	p := BuildProject(v)
	for _, name := range []string{"phpmyadmin", "elasticsearch", "mailpit", "photon"} {
		if _, ok := p.Services[name]; !ok {
			t.Fatalf("missing conditional service %q", name)
		}
	}
	if p.Volumes["search_data"] == nil || p.Volumes["pma_www"] == nil {
		t.Fatalf("conditional volumes missing: %+v", p.Volumes)
	}
	if p.Services["phpmyadmin"].Labels["traefik.enable"] != "true" {
		t.Fatalf("pma missing labels")
	}
}

func TestBuildProjectLocalModeOmitsInitServicesAndVolumes(t *testing.T) {
	v := baseView()
	v.MuPluginsLocal = true
	v.MuPluginsDir = "/srv/mu"
	v.AppCodeLocal = true
	v.AppCodeDir = "/srv/app"
	p := BuildProject(v)
	if _, ok := p.Services["vip-mu-plugins"]; ok {
		t.Fatalf("vip-mu-plugins should be absent in local mu-plugins mode")
	}
	if _, ok := p.Services["demo-app-code"]; ok {
		t.Fatalf("demo-app-code should be absent in local appCode mode")
	}
	if p.Volumes["mu-plugins"] != nil || p.Volumes["clientcode_themes"] != nil {
		t.Fatalf("named content volumes should be absent in local mode: %+v", p.Volumes)
	}
}

func TestBuildProjectExternalVolumesWhenMigrating(t *testing.T) {
	v := baseView()
	v.Migrate = true
	v.ExternalVolumeNames = map[string]string{"database_data": "landovipdevexample_database_data"}
	p := BuildProject(v)
	dv := p.Volumes["database_data"]
	if dv == nil || !dv.External || dv.Name != "landovipdevexample_database_data" {
		t.Fatalf("database_data not mapped to external Lando name: %+v", dv)
	}
}

// netHas reports whether a service's Networks list contains net.
func netHas(s *Service, net string) bool {
	for _, n := range s.Networks {
		if n == net {
			return true
		}
	}
	return false
}

// TestBuildProjectNetworkIsolation guards against the cross-environment DB bleed
// bug: backend services must NOT join the shared external proxy network (where a
// bare `database` alias from every env collides under Docker round-robin DNS).
// They live on the per-project network only; the proxy network carries just the
// Traefik-routed edge services.
func TestBuildProjectNetworkIsolation(t *testing.T) {
	v := baseView()
	v.PHPMyAdmin = true
	v.Elasticsearch = true
	v.Mailpit = true
	v.Photon = true
	p := BuildProject(v)

	// The per-project network is declared and is NOT external (each env gets its
	// own `<slug>_default`, so bare service names resolve within the env only).
	if p.Networks[ProjectNetwork] == nil {
		t.Fatalf("per-project network %q not declared: %+v", ProjectNetwork, p.Networks)
	}
	if p.Networks[ProjectNetwork].External {
		t.Fatalf("per-project network %q must NOT be external (would re-collide across envs)", ProjectNetwork)
	}

	// Backends must be on the per-project network and OFF the shared proxy net.
	backends := []string{"database", "memcached", "php", "wordpress", "elasticsearch", "photon", "vip-mu-plugins", "demo-app-code"}
	for _, name := range backends {
		s, ok := p.Services[name]
		if !ok {
			t.Fatalf("expected backend service %q", name)
		}
		if !netHas(s, ProjectNetwork) {
			t.Errorf("backend %q not on per-project network %q: %v", name, ProjectNetwork, s.Networks)
		}
		if netHas(s, ProxyNetwork) {
			t.Errorf("backend %q must NOT be on shared proxy network %q (cross-env collision): %v", name, ProxyNetwork, s.Networks)
		}
	}

	// Edge (Traefik-routed) services must be on BOTH networks: the proxy net so
	// the shared Traefik can reach them, and the per-project net to reach backends.
	for _, name := range []string{"nginx", "phpmyadmin", "mailpit"} {
		s, ok := p.Services[name]
		if !ok {
			t.Fatalf("expected edge service %q", name)
		}
		if !netHas(s, ProjectNetwork) || !netHas(s, ProxyNetwork) {
			t.Errorf("edge %q must be on both %q and %q: %v", name, ProjectNetwork, ProxyNetwork, s.Networks)
		}
	}
}

func TestBuildProjectNameMatchesSlug(t *testing.T) {
	v := View{SiteSlug: "example-site"}
	p := BuildProject(v)
	if p.Name != "example-site" {
		t.Fatalf("Project.Name = %q, want the bare slug %q (must match the `-p <slug>` the runner passes)", p.Name, "example-site")
	}
}

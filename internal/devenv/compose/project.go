package compose

// BuildProject assembles the full compose Project for an environment.
func BuildProject(v View) *Project {
	p := &Project{
		// Name must equal the slug the runner passes via `-p <slug>` (which
		// wins over compose's top-level name: anyway). Aligning them removes
		// the Plan-4 ambiguity so exec/logs/ps all key off one project name.
		Name:     v.SiteSlug,
		Services: map[string]*Service{},
		Volumes:  map[string]*TopLevelVolume{},
		// ProjectNetwork is per-env (compose names it `<slug>_default`) and carries
		// the bare service-name aliases; ProxyNetwork is the shared external proxy
		// net. See the ProxyNetwork/ProjectNetwork docs for why backends must stay
		// off the shared net (cross-env `database` alias collision).
		Networks: map[string]*Network{
			ProjectNetwork: {},
			ProxyNetwork:   {External: true, Name: ProxyNetwork},
		},
	}

	// Always-on services.
	p.Services["database"] = databaseService(v)
	p.Services["memcached"] = memcachedService()
	p.Services["php"] = phpService(v)
	nginx := nginxService(v)
	nginx.Labels = nginxLabels(v)
	p.Services["nginx"] = nginx
	p.Services["wordpress"] = wordpressService(v)

	// Conditional services.
	if v.PHPMyAdmin {
		pma := phpMyAdminService()
		pma.Labels = phpMyAdminLabels(v)
		p.Services["phpmyadmin"] = pma
	}
	if v.Elasticsearch {
		p.Services["elasticsearch"] = elasticsearchService()
	}
	if v.Mailpit {
		mp := mailpitService()
		mp.Labels = mailpitLabels(v)
		p.Services["mailpit"] = mp
	}
	if v.Photon {
		p.Services["photon"] = photonService()
	}
	if !v.MuPluginsLocal {
		p.Services["vip-mu-plugins"] = vipMuPluginsService(v)
	}
	if !v.AppCodeLocal {
		p.Services["demo-app-code"] = demoAppCodeService()
	}

	declareVolumes(p, v)
	return p
}

// declareVolumes declares each named volume referenced by an enabled service,
// marking it external (mapped to a Lando volume name) when migrating.
func declareVolumes(p *Project, v View) {
	names := []string{"database_data", "devtools", "scripts"}
	if !v.MuPluginsLocal {
		names = append(names, "mu-plugins")
	}
	if !v.AppCodeLocal {
		names = append(names,
			"clientcode_clientmuPlugins", "clientcode_images", "clientcode_languages",
			"clientcode_plugins", "clientcode_private", "clientcode_themes", "clientcode_vipconfig")
	}
	if v.Elasticsearch {
		names = append(names, "search_data")
	}
	if v.PHPMyAdmin {
		names = append(names, "pma_www")
	}

	for _, n := range names {
		tv := &TopLevelVolume{}
		if v.Migrate {
			if ext, ok := v.ExternalVolumeNames[n]; ok && ext != "" {
				tv.External = true
				tv.Name = ext
			}
		}
		p.Volumes[n] = tv
	}
}

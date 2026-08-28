package compose

import (
	"fmt"
	"strings"
)

// backendNetworks attaches a service to the per-project network only. Backend
// services must never join ProxyNetwork: their bare service-name alias (e.g.
// `database`) collides across environments on that shared network, so Docker
// round-robin DNS would route one env's traffic to another's. See ProxyNetwork.
func backendNetworks() []string { return []string{ProjectNetwork} }

// edgeNetworks attaches a Traefik-routed service to both the per-project network
// (so it can reach backends like php/database) and the shared proxy network (so
// the central Traefik proxy can route to it). Only nginx/phpmyadmin/mailpit —
// the services carrying traefik.enable labels — use this.
func edgeNetworks() []string { return []string{ProjectNetwork, ProxyNetwork} }

// databaseService ports the EJS database service (lines 103-126): a mariadb
// or mysql container with VIP's sql-mode flags and the wordpress DB.
func databaseService(v View) *Service {
	isMariaDB := strings.HasPrefix(v.DatabaseImage, "mariadb:")
	var command string
	if isMariaDB {
		command = `docker-entrypoint.sh mysqld --sql-mode=ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION --max_allowed_packet=67M`
	} else {
		command = `docker-entrypoint.sh mysqld --sql-mode=ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION --max_allowed_packet=67M --mysql-native-password=ON`
	}
	return &Service{
		Image:   v.DatabaseImage,
		Command: command,
		Ports:   []string{":3306"},
		Environment: map[string]string{
			"MYSQL_ALLOW_EMPTY_PASSWORD": "true",
			"MYSQL_USER":                 "wordpress",
			"MYSQL_PASSWORD":             "wordpress",
			"MYSQL_DATABASE":             "wordpress",
			"LANDO_NO_USER_PERMS":        "1",
			"LANDO_NO_SCRIPTS":           "1",
			"LANDO_NEEDS_EXEC":           "1",
		},
		Volumes:  []VolumeMount{{Short: "database_data:/var/lib/mysql"}},
		Networks: backendNetworks(),
	}
}

// memcachedService ports the EJS memcached service (lines 128-136).
func memcachedService() *Service {
	return &Service{
		Image:   "memcached:1.6-alpine",
		Command: "memcached -m 64",
		Environment: map[string]string{
			"LANDO_NO_USER_PERMS": "1",
			"LANDO_NO_SCRIPTS":    "1",
			"LANDO_NEEDS_EXEC":    "1",
		},
		Networks: backendNetworks(),
	}
}

// wpVolumes ports the EJS wpVolumes() function (lines 307-368): the shared
// WordPress content mounts, differing for image vs local muPlugins/appCode.
func wpVolumes(v View) []VolumeMount {
	// Order matters: a parent mount must precede its nested mounts. The EJS
	// template lists ./wordpress:/wp last, which only works under the docker
	// compose plugin (it sorts mounts by destination depth). Standalone
	// docker-compose mounts in file order, so ./wordpress:/wp listed after
	// ./config:/wp/config would shadow /wp/config (and /wp/log, /wp/.../uploads),
	// making them inaccessible -> the run_as_root chown fails. Mount /wp first,
	// then its children; /wp/config/integrations-config comes after /wp/config.
	vols := []VolumeMount{
		{Short: "./wordpress:/wp"},
		{Short: "./config:/wp/config"},
		{Short: "./log:/wp/log"},
		{Short: "./uploads:/wp/wp-content/uploads"},
		{Short: "./integrations-config:/wp/config/integrations-config"},
	}

	if v.MuPluginsLocal {
		vols = append(vols, VolumeMount{Short: v.MuPluginsDir + ":/wp/wp-content/mu-plugins"})
	} else {
		vols = append(vols, VolumeMount{Type: "volume", Source: "mu-plugins", Target: "/wp/wp-content/mu-plugins", NoCopy: true})
	}

	if v.AppCodeLocal {
		d := v.AppCodeDir
		vols = append(vols,
			VolumeMount{Short: d + "/client-mu-plugins:/wp/wp-content/client-mu-plugins"},
			VolumeMount{Short: d + "/images:/wp/wp-content/images"},
			VolumeMount{Short: d + "/languages:/wp/wp-content/languages"},
			VolumeMount{Short: d + "/plugins:/wp/wp-content/plugins"},
			VolumeMount{Short: d + "/private:/wp/wp-content/private"},
			VolumeMount{Short: d + "/themes:/wp/wp-content/themes"},
			VolumeMount{Short: d + "/vip-config:/wp/vip-config"},
		)
	} else {
		for _, m := range []struct{ src, tgt string }{
			{"clientcode_clientmuPlugins", "/wp/wp-content/client-mu-plugins"},
			{"clientcode_images", "/wp/wp-content/images"},
			{"clientcode_languages", "/wp/wp-content/languages"},
			{"clientcode_plugins", "/wp/wp-content/plugins"},
			{"clientcode_private", "/wp/wp-content/private"},
			{"clientcode_themes", "/wp/wp-content/themes"},
			{"clientcode_vipconfig", "/wp/vip-config"},
		} {
			vols = append(vols, VolumeMount{Type: "volume", Source: m.src, Target: m.tgt, NoCopy: true})
		}
	}
	return vols
}

// nginxService ports the EJS nginx service (lines 22-34).
func nginxService(v View) *Service {
	vols := append([]VolumeMount{{Short: "./nginx/extra.conf:/etc/nginx/conf.extra/extra.conf"}}, wpVolumes(v)...)
	return &Service{
		Image:      "ghcr.io/automattic/vip-container-images/nginx:latest",
		Entrypoint: `/usr/sbin/nginx -g "daemon off;"`,
		Volumes:    vols,
		DependsOn:  map[string]DependsOn{"php": {Condition: "service_started"}},
		Networks:   edgeNetworks(),
	}
}

// phpService ports the EJS php service (lines 36-101) WITHOUT the run /
// run_as_root steps (those become SetupSteps in Task 9).
func phpService(v View) *Service {
	env := map[string]string{
		"LANDO_NO_USER_PERMS": "enable",
		"LANDO_NEEDS_EXEC":    "1",
		// LANDO_APP_NAME is the env slug. Lando set this automatically; the Go
		// port must, so the shared php-fpm image's bash.bashrc banner ("shell:
		// <name>") and other LANDO_APP_NAME-dependent tooling resolve it. Set
		// before the user-env loop below so it stays reserved.
		"LANDO_APP_NAME": v.SiteSlug,
	}
	if v.Xdebug {
		env["XDEBUG"] = "enable"
	} else {
		env["XDEBUG"] = "disable"
	}
	if v.XdebugConfig != "" {
		env["XDEBUG_CONFIG"] = v.XdebugConfig
	}
	if v.AutologinKey != "" {
		env["VIP_DEV_AUTOLOGIN_KEY"] = v.AutologinKey
	}
	if v.Cron {
		env["ENABLE_CRON"] = "1"
	}

	dep := map[string]DependsOn{
		"database":  {Condition: "service_started"},
		"memcached": {Condition: "service_started"},
		"wordpress": {Condition: "service_completed_successfully"},
	}
	if v.Elasticsearch {
		dep["elasticsearch"] = DependsOn{Condition: "service_started"}
	}
	if !v.MuPluginsLocal {
		dep["vip-mu-plugins"] = DependsOn{Condition: "service_started"}
	}
	if !v.AppCodeLocal {
		dep["demo-app-code"] = DependsOn{Condition: "service_completed_successfully"}
	}

	vols := append([]VolumeMount{
		{Type: "volume", Source: "devtools", Target: "/dev-tools", NoCopy: true},
		{Type: "volume", Source: "scripts", Target: "/scripts", NoCopy: true},
	}, wpVolumes(v)...)

	// User env vars (Plan 5 envvar) are injected last but never override a
	// reserved LANDO_*/XDEBUG/etc. key already set above.
	for k, val := range v.EnvVars {
		if _, reserved := env[k]; !reserved {
			env[k] = val
		}
	}

	return &Service{
		Image:       v.PHPImage,
		Command:     "run.sh",
		WorkingDir:  "/wp",
		EnvFile:     []string{".env"},
		Environment: env,
		DependsOn:   dep,
		Volumes:     vols,
		Networks:    backendNetworks(),
	}
}

// wordpressService ports the EJS wordpress init service (lines 191-203). It is
// a run-once (initOnly) container that rsyncs the WP core + dev-tools into
// shared volumes; the initOnly semantics are lifecycle metadata (Task 9).
func wordpressService(v View) *Service {
	entry := fmt.Sprintf(`/bin/sh -c '/usr/bin/rsync -ac --delete --chown=%s:%s /wp/ /shared/; /usr/bin/rsync -ac --chown=%s:%s --delete /dev-tools-orig/ /dev-tools/'`,
		"${LANDO_HOST_USER_ID}", "${LANDO_HOST_GROUP_ID}", "${LANDO_HOST_USER_ID}", "${LANDO_HOST_GROUP_ID}")
	return &Service{
		Image:      v.WordPressImage,
		Entrypoint: entry,
		Volumes: []VolumeMount{
			{Short: "./wordpress:/shared"},
			{Short: "devtools:/dev-tools"},
			{Short: "scripts:/scripts"},
		},
		Networks: backendNetworks(),
	}
}

// phpMyAdminService ports the EJS phpmyadmin service (lines 138-161).
func phpMyAdminService() *Service {
	return &Service{
		Image:   "phpmyadmin:5",
		Command: "/docker-entrypoint.sh apache2-foreground",
		Ports:   []string{"127.0.0.1::80"},
		Environment: map[string]string{
			"MYSQL_ROOT_PASSWORD": "",
			"PMA_HOSTS":           "database",
			"PMA_PORT":            "3306",
			"PMA_USER":            "root",
			"PMA_PASSWORD":        "",
			"UPLOAD_LIMIT":        "4G",
			"LANDO_NO_USER_PERMS": "1",
			"LANDO_NEEDS_EXEC":    "1",
		},
		Volumes:  []VolumeMount{{Short: "pma_www:/var/www/html"}},
		Networks: edgeNetworks(),
	}
}

// elasticsearchService ports the EJS elasticsearch service (lines 163-189).
func elasticsearchService() *Service {
	return &Service{
		Image:   "elasticsearch:8.18.2",
		Command: "/usr/local/bin/docker-entrypoint.sh",
		Ports:   []string{":9200"},
		Deploy:  &Deploy{Resources: Resources{Limits: ResourceLimits{Memory: "1GB"}}},
		Environment: map[string]string{
			"ELASTICSEARCH_IS_DEDICATED_NODE": "no",
			"ELASTICSEARCH_CLUSTER_NAME":      "bespin",
			"ELASTICSEARCH_NODE_NAME":         "lando",
			"ELASTICSEARCH_PORT_NUMBER":       "9200",
			"discovery.type":                  "single-node",
			"xpack.security.enabled":          "false",
			"LANDO_NO_USER_PERMS":             "1",
			"LANDO_NO_SCRIPTS":                "1",
			"LANDO_NEEDS_EXEC":                "1",
		},
		Volumes:  []VolumeMount{{Short: "search_data:/usr/share/elasticsearch/data"}},
		Networks: backendNetworks(),
	}
}

// mailpitService ports the EJS mailpit service (lines 256-270). The EJS sets
// `command: /mailpit`, but that only worked under Lando (which strips the image
// entrypoint). The axllent/mailpit image ENTRYPOINT is already ["/mailpit"], so
// in raw docker compose a `command: /mailpit` is appended → `/mailpit /mailpit`
// → "unknown command /mailpit" and the container exits 1. We set NO command and
// let the entrypoint run (same Lando-vs-raw-compose trap as demo-app-code's
// `exit 0`).
func mailpitService() *Service {
	return &Service{
		Image: "axllent/mailpit:latest",
		Ports: []string{":1025", ":8025"},
		Environment: map[string]string{
			"LANDO_NO_USER_PERMS": "1",
			"LANDO_NEEDS_EXEC":    "1",
		},
		Networks: edgeNetworks(),
	}
}

// photonService ports the EJS photon service (lines 272-284).
func photonService() *Service {
	return &Service{
		Image:   "ghcr.io/automattic/vip-container-images/photon:latest",
		Command: "/usr/sbin/php-fpm",
		Environment: map[string]string{
			"LANDO_NO_USER_PERMS": "1",
			"LANDO_NO_SCRIPTS":    "1",
			"LANDO_NEEDS_EXEC":    "1",
		},
		Volumes:  []VolumeMount{{Short: "./uploads:/usr/share/webapps/photon/uploads:ro"}},
		Networks: backendNetworks(),
	}
}

// vipMuPluginsService ports the EJS vip-mu-plugins init service (205-226).
// The View parameter is unused today but kept for builder-call uniformity.
func vipMuPluginsService(_ View) *Service {
	return &Service{
		Image:   "ghcr.io/automattic/vip-container-images/mu-plugins:0.1",
		Command: "/bin/sh /run.sh",
		Environment: map[string]string{
			"LANDO_NO_SCRIPTS": "1",
			"LANDO_NEEDS_EXEC": "1",
			"LANDO_HOST_UID":   "${LANDO_HOST_USER_ID}",
			"LANDO_HOST_GID":   "${LANDO_HOST_GROUP_ID}",
		},
		Volumes: []VolumeMount{
			{Short: "mu-plugins:/shared"},
			{Type: "volume", Source: "scripts", Target: "/scripts", NoCopy: true},
		},
		Networks: backendNetworks(),
	}
}

// demoAppCodeService ports the EJS demo-app-code init service (228-254).
func demoAppCodeService() *Service {
	vols := []VolumeMount{}
	for _, m := range []struct{ src, tgt string }{
		{"clientcode_clientmuPlugins", "/clientcode/client-mu-plugins"},
		{"clientcode_images", "/clientcode/images"},
		{"clientcode_languages", "/clientcode/languages"},
		{"clientcode_plugins", "/clientcode/plugins"},
		{"clientcode_private", "/clientcode/private"},
		{"clientcode_themes", "/clientcode/themes"},
		{"clientcode_vipconfig", "/clientcode/vip-config"},
	} {
		vols = append(vols, VolumeMount{Short: m.src + ":" + m.tgt})
	}
	return &Service{
		Image: "ghcr.io/automattic/vip-container-images/skeleton:latest",
		// EJS uses `command: exit 0`, which worked only because Lando wrapped
		// service commands in a shell. Raw docker compose exec's the command
		// directly and `exit` is a shell builtin (not a binary), so wrap it in
		// `sh -c`. compose shlex-parses the quoted string, keeping "exit 0" as
		// one arg → /bin/sh -c "exit 0" → a clean no-op exit.
		Command: `/bin/sh -c "exit 0"`,
		Environment: map[string]string{
			"LANDO_HOST_UID": "${LANDO_HOST_USER_ID}",
			"LANDO_HOST_GID": "${LANDO_HOST_GROUP_ID}",
		},
		Volumes:  vols,
		Networks: backendNetworks(),
	}
}

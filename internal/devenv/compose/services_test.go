package compose

import (
	"strings"
	"testing"
)

// baseView is the shared test fixture for service builders (image mode for
// muPlugins/appCode unless a test flips the *Local flags).
func baseView() View {
	return View{
		SiteSlug: "example", Domain: "vipdev.lndo.site", DatabaseImage: "mysql:8.4",
		WordPressImage: "ghcr.io/automattic/vip-container-images/wordpress:trunk",
		PHPImage:       "php:8.2", AdminPassword: "password", HostUID: "1000", HostGID: "1000",
	}
}

func TestDatabaseServiceMySQL(t *testing.T) {
	svc := databaseService(baseView())
	if svc.Image != "mysql:8.4" {
		t.Fatalf("image = %q", svc.Image)
	}
	if !strings.Contains(svc.Command, "--mysql-native-password=ON") {
		t.Fatalf("mysql command missing native-password flag: %q", svc.Command)
	}
	if svc.Environment["MYSQL_DATABASE"] != "wordpress" {
		t.Fatalf("MYSQL_DATABASE = %q", svc.Environment["MYSQL_DATABASE"])
	}
	if len(svc.Volumes) != 1 || svc.Volumes[0].Short != "database_data:/var/lib/mysql" {
		t.Fatalf("db volume wrong: %+v", svc.Volumes)
	}
}

func TestDatabaseServiceMariaDB(t *testing.T) {
	v := baseView()
	v.DatabaseImage = "mariadb:10.11"
	svc := databaseService(v)
	if svc.Image != "mariadb:10.11" {
		t.Fatalf("image = %q", svc.Image)
	}
	if !strings.Contains(svc.Command, "NO_AUTO_CREATE_USER") {
		t.Fatalf("mariadb command wrong: %q", svc.Command)
	}
}

func TestMemcachedService(t *testing.T) {
	svc := memcachedService()
	if svc.Image != "memcached:1.6-alpine" || svc.Command != "memcached -m 64" {
		t.Fatalf("memcached wrong: %+v", svc)
	}
}

func TestWPVolumesImageMode(t *testing.T) {
	v := baseView() // appCode/muPlugins image mode (locals false)
	vols := wpVolumes(v)
	must := []string{
		"./config:/wp/config",
		"./log:/wp/log",
		"./uploads:/wp/wp-content/uploads",
		"./wordpress:/wp",
		"./integrations-config:/wp/config/integrations-config",
	}
	for _, m := range must {
		if !hasShort(vols, m) {
			t.Fatalf("wpVolumes missing %q: %+v", m, vols)
		}
	}
	if !hasNamed(vols, "mu-plugins", "/wp/wp-content/mu-plugins") {
		t.Fatalf("expected mu-plugins named volume in image mode")
	}
}

func TestWPVolumesLocalMode(t *testing.T) {
	v := baseView()
	v.MuPluginsLocal = true
	v.MuPluginsDir = "/srv/mu"
	v.AppCodeLocal = true
	v.AppCodeDir = "/srv/app"
	vols := wpVolumes(v)
	if !hasShort(vols, "/srv/mu:/wp/wp-content/mu-plugins") {
		t.Fatalf("local mu-plugins bind missing: %+v", vols)
	}
	if !hasShort(vols, "/srv/app/plugins:/wp/wp-content/plugins") {
		t.Fatalf("local appCode plugins bind missing: %+v", vols)
	}
}

func TestNginxServiceDependsOnPHP(t *testing.T) {
	svc := nginxService(baseView())
	if svc.Image != "ghcr.io/automattic/vip-container-images/nginx:latest" {
		t.Fatalf("nginx image = %q", svc.Image)
	}
	if svc.DependsOn["php"].Condition != "service_started" {
		t.Fatalf("nginx should depend_on php service_started: %+v", svc.DependsOn)
	}
	if !hasShort(svc.Volumes, "./nginx/extra.conf:/etc/nginx/conf.extra/extra.conf") {
		t.Fatalf("nginx extra.conf mount missing: %+v", svc.Volumes)
	}
}

func TestPHPServiceDependsAndEnv(t *testing.T) {
	v := baseView()
	v.Xdebug = true
	svc := phpService(v)
	if svc.WorkingDir != "/wp" || svc.Command != "run.sh" {
		t.Fatalf("php working_dir/command wrong: %+v", svc)
	}
	if svc.Environment["XDEBUG"] != "enable" {
		t.Fatalf("xdebug env = %q, want enable", svc.Environment["XDEBUG"])
	}
	if svc.DependsOn["database"].Condition != "service_started" {
		t.Fatalf("php depends_on database missing")
	}
	if svc.DependsOn["wordpress"].Condition != "service_completed_successfully" {
		t.Fatalf("php depends_on wordpress completed missing: %+v", svc.DependsOn)
	}
}

// TestPHPServiceSetsAppName guards that the php container exports LANDO_APP_NAME
// (the env slug). Lando injected this automatically; the Go port must set it so
// the shared php-fpm image's /etc/bash.bashrc banner ("shell: <name>") and any
// LANDO_APP_NAME-dependent tooling work. It is reserved (a user env var of the
// same name must not override it).
func TestPHPServiceSetsAppName(t *testing.T) {
	v := baseView()
	v.SiteSlug = "my-env"
	if got := phpService(v).Environment["LANDO_APP_NAME"]; got != "my-env" {
		t.Fatalf("LANDO_APP_NAME = %q, want the slug %q", got, "my-env")
	}
	v2 := baseView()
	v2.SiteSlug = "my-env"
	v2.EnvVars = map[string]string{"LANDO_APP_NAME": "hijacked"}
	if got := phpService(v2).Environment["LANDO_APP_NAME"]; got != "my-env" {
		t.Fatalf("LANDO_APP_NAME overridden by user env var: got %q want %q", got, "my-env")
	}
}

func TestWordPressInitService(t *testing.T) {
	svc := wordpressService(baseView())
	if svc.Image != "ghcr.io/automattic/vip-container-images/wordpress:trunk" {
		t.Fatalf("wordpress image = %q", svc.Image)
	}
	if !hasShort(svc.Volumes, "./wordpress:/shared") {
		t.Fatalf("wordpress /shared mount missing: %+v", svc.Volumes)
	}
}

func TestPhpMyAdminService(t *testing.T) {
	svc := phpMyAdminService()
	if svc.Image != "phpmyadmin:5" {
		t.Fatalf("pma image = %q", svc.Image)
	}
	if svc.Environment["PMA_HOSTS"] != "database" {
		t.Fatalf("PMA_HOSTS = %q", svc.Environment["PMA_HOSTS"])
	}
	if !hasShort(svc.Volumes, "pma_www:/var/www/html") {
		t.Fatalf("pma volume missing: %+v", svc.Volumes)
	}
}

func TestElasticsearchServiceMemoryLimit(t *testing.T) {
	svc := elasticsearchService()
	if svc.Image != "elasticsearch:8.18.2" {
		t.Fatalf("es image = %q", svc.Image)
	}
	if svc.Deploy == nil || svc.Deploy.Resources.Limits.Memory != "1GB" {
		t.Fatalf("es memory limit missing: %+v", svc.Deploy)
	}
}

func TestMailpitAndPhotonAndInitServices(t *testing.T) {
	if mailpitService().Image != "axllent/mailpit:latest" {
		t.Fatal("mailpit image wrong")
	}
	// The axllent/mailpit image ENTRYPOINT is already ["/mailpit"]; the EJS
	// `command: /mailpit` only worked under Lando (which strips the image
	// entrypoint). In raw compose, command is appended → `/mailpit /mailpit` →
	// "unknown command /mailpit" and the container exits 1. So set NO command and
	// let the entrypoint run.
	if got := mailpitService().Command; got != "" {
		t.Fatalf("mailpit Command = %q, want empty (image entrypoint /mailpit runs it; a command duplicates the entrypoint)", got)
	}
	if photonService().Image != "ghcr.io/automattic/vip-container-images/photon:latest" {
		t.Fatal("photon image wrong")
	}
	if vipMuPluginsService(baseView()).Image != "ghcr.io/automattic/vip-container-images/mu-plugins:0.1" {
		t.Fatal("mu-plugins image wrong")
	}
	if demoAppCodeService().Image != "ghcr.io/automattic/vip-container-images/skeleton:latest" {
		t.Fatal("skeleton image wrong")
	}
	// The EJS `exit 0` is a shell builtin; raw docker compose exec's the command
	// directly (no Lando shell wrapper), so it MUST be shell-wrapped or the init
	// container dies with `exec: "exit": executable file not found`.
	if got := demoAppCodeService().Command; got != `/bin/sh -c "exit 0"` {
		t.Fatalf("demo-app-code command = %q, want a shell-wrapped no-op", got)
	}
}

func TestPHPServiceInjectsEnvVars(t *testing.T) {
	v := View{PHPImage: "php:img", EnvVars: map[string]string{"MY_VAR": "v1"}}
	svc := phpService(v)
	if svc.Environment["MY_VAR"] != "v1" {
		t.Fatalf("user env var not injected into php service: %+v", svc.Environment)
	}
	// Reserved keys must not be overridden by a user var of the same name.
	v2 := View{PHPImage: "php:img", EnvVars: map[string]string{"LANDO_NEEDS_EXEC": "0"}}
	if got := phpService(v2).Environment["LANDO_NEEDS_EXEC"]; got != "1" {
		t.Fatalf("reserved env var was overridden by user var: got %q want \"1\"", got)
	}
}

func hasShort(vols []VolumeMount, s string) bool {
	for _, v := range vols {
		if v.Short == s {
			return true
		}
	}
	return false
}
func hasNamed(vols []VolumeMount, source, target string) bool {
	for _, v := range vols {
		if v.Short == "" && v.Source == source && v.Target == target {
			return true
		}
	}
	return false
}

// TestWPVolumesMountParentFirst guards the mount-ordering fix: the /wp parent
// bind must precede its nested children, else standalone docker-compose mounts
// ./wordpress:/wp over /wp/config (etc.), hiding them and breaking the chown.
func TestWPVolumesMountParentFirst(t *testing.T) {
	vols := wpVolumes(View{})
	idxOf := func(target string) int {
		for i, v := range vols {
			if v.Short == target {
				return i
			}
		}
		return -1
	}
	wp := idxOf("./wordpress:/wp")
	if wp < 0 {
		t.Fatal("./wordpress:/wp mount missing")
	}
	for _, child := range []string{"./config:/wp/config", "./log:/wp/log", "./uploads:/wp/wp-content/uploads"} {
		ci := idxOf(child)
		if ci < 0 || ci < wp {
			t.Fatalf("%s (idx %d) must be mounted AFTER ./wordpress:/wp (idx %d)", child, ci, wp)
		}
	}
	cfg := idxOf("./config:/wp/config")
	ic := idxOf("./integrations-config:/wp/config/integrations-config")
	if ic < cfg {
		t.Fatalf("integrations-config (idx %d) must be after /wp/config (idx %d)", ic, cfg)
	}
}

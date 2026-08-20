package commands

import "testing"

func TestResolveCreateConfigNonInteractiveDefaults(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := devEnvCreateCmd()
	if err := c.Flags().Parse([]string{"--slug", "x"}); err != nil {
		t.Fatal(err)
	}
	cfg, err := resolveCreateConfig(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Slug != "x" {
		t.Fatalf("Slug = %q", cfg.Slug)
	}
	if cfg.Title != "VIP Dev" {
		t.Fatalf("Title default = %q, want VIP Dev", cfg.Title)
	}
	if cfg.MultisiteMode != "" {
		t.Fatalf("MultisiteMode default = %q, want single site", cfg.MultisiteMode)
	}
	if cfg.PHP != "" {
		t.Fatalf("PHP default = %q, want empty (NewView resolves to recommended)", cfg.PHP)
	}
	if cfg.PHPMyAdmin || cfg.Xdebug || cfg.Mailpit || cfg.Photon || cfg.Elasticsearch {
		t.Fatalf("service toggles should default off: %+v", cfg)
	}
	if cfg.Start {
		t.Fatal("Start must default FALSE (register 2.22)")
	}
}

// Register 2.22. Node's `dev-env create` only writes files — it ends by
// printing "To start the environment run: vip dev-env start"
// (vip-dev-env-create.js:173-179) and never starts anything. vip-next defaulted
// --start to true, and Start escalates to `sudo /bin/sh` to edit /etc/hosts and
// install a CA, so a CI script that used create as a cheap file-writing step
// pulled images, mutated the system trust store, and could block forever on a
// sudo prompt. The FLAG stays (it is registered vip-next surface); the DEFAULT
// must match Node.
func TestResolveCreateConfigStartDefaultsFalse(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := devEnvCreateCmd()
	if err := c.Flags().Parse([]string{"--slug", "x"}); err != nil {
		t.Fatal(err)
	}
	cfg, err := resolveCreateConfig(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Start {
		t.Fatal("create must not start (and must not reach sudo) unless --start is passed")
	}
}

// The flag itself must survive — it is registered vip-next surface (cutover
// register section 4), so `--start` still starts.
func TestResolveCreateConfigStartFlagStillWorks(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := devEnvCreateCmd()
	if err := c.Flags().Parse([]string{"--slug", "x", "--start"}); err != nil {
		t.Fatal(err)
	}
	cfg, err := resolveCreateConfig(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Start {
		t.Fatal("--start must still start the environment")
	}
}

// Register 2.21 for create: Node resolves create's slug through the same
// getEnvironmentName, so a configured repo creates the CONFIGURED environment,
// not "vip-local". Without this, create and start/destroy target different
// environments in the same repo.
func TestResolveCreateConfigUsesConfigurationFileSlug(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	repo := t.TempDir()
	writeDevEnvConfig(t, repo, "configured-site")
	t.Chdir(repo)

	c := devEnvCreateCmd()
	if err := c.Flags().Parse(nil); err != nil {
		t.Fatal(err)
	}
	cfg, err := resolveCreateConfig(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Slug != "configured-site" {
		t.Fatalf("Slug = %q, want configured-site from .wpvip/vip-dev-env.yml", cfg.Slug)
	}
}

// Node rejects an unsupported PHP version up front, in promptForArguments,
// BEFORE createEnvironment writes anything (resolvePhpVersion,
// dev-environment-cli.ts:778-782). vip-next passed any bare version straight
// through to the image name, so a typo only surfaced as an opaque
// `docker pull` failure AFTER the environment was already on disk.
func TestResolveCreateConfigRejectsUnsupportedPHPVersion(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := devEnvCreateCmd()
	if err := c.Flags().Parse([]string{"--slug", "x", "--php", "8.9"}); err != nil {
		t.Fatal(err)
	}
	_, err := resolveCreateConfig(c, nil)
	if err == nil {
		t.Fatal("an unsupported PHP version must be rejected before the environment is written")
	}
	if want := "Unknown or unsupported PHP version: 8.9."; err.Error() != want {
		t.Errorf("error = %q, want %q", err, want)
	}
}

func TestResolveCreateConfigAcceptsSupportedPHPVersions(t *testing.T) {
	for _, v := range []string{"8.2", "8.3", "8.4", "8.5"} {
		t.Setenv("VIP_NON_INTERACTIVE", "1")
		c := devEnvCreateCmd()
		if err := c.Flags().Parse([]string{"--slug", "x", "--php", v}); err != nil {
			t.Fatal(err)
		}
		if _, err := resolveCreateConfig(c, nil); err != nil {
			t.Errorf("PHP %s must be accepted: %v", v, err)
		}
	}
}

// An explicit image reference stays a deliberate vip-next superset (Node only
// accepts the four canonical image strings). Validation targets the typo case,
// not the escape hatch.
func TestResolveCreateConfigAcceptsExplicitPHPImage(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := devEnvCreateCmd()
	if err := c.Flags().Parse([]string{"--slug", "x", "--php", "ghcr.io/automattic/vip-container-images/php-fpm:8.3"}); err != nil {
		t.Fatal(err)
	}
	if _, err := resolveCreateConfig(c, nil); err != nil {
		t.Errorf("explicit image references must keep working: %v", err)
	}
}

// --slug still beats the configuration file on create.
func TestResolveCreateConfigFlagSlugBeatsConfigurationFile(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	repo := t.TempDir()
	writeDevEnvConfig(t, repo, "configured-site")
	t.Chdir(repo)

	c := devEnvCreateCmd()
	if err := c.Flags().Parse([]string{"--slug", "explicit"}); err != nil {
		t.Fatal(err)
	}
	cfg, err := resolveCreateConfig(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Slug != "explicit" {
		t.Fatalf("Slug = %q, want explicit", cfg.Slug)
	}
}

func TestResolveCreateConfigAppDefaultsSeedConfig(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := devEnvCreateCmd()
	if err := c.Flags().Parse([]string{"--slug", "with-app"}); err != nil {
		t.Fatal(err)
	}
	defaults := &createDefaults{
		Title: "cantina-trunk-staging", Multisite: true, PHP: "8.2",
		WordPress: "6.4", MediaRedirectDomain: "cantina.example.com",
	}
	cfg, err := resolveCreateConfig(c, defaults)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Title != "cantina-trunk-staging" {
		t.Fatalf("Title = %q, want app env name", cfg.Title)
	}
	if cfg.MultisiteMode != "subdomain" {
		t.Fatalf("MultisiteMode = %q, want subdomain (app is multisite)", cfg.MultisiteMode)
	}
	if cfg.PHP != "8.2" || cfg.WordPress != "6.4" {
		t.Fatalf("php/wordpress defaults not applied: %+v", cfg)
	}
	if cfg.MediaDomain != "cantina.example.com" {
		t.Fatalf("MediaDomain = %q, want app primary domain", cfg.MediaDomain)
	}
}

// A passed flag still wins over an @app.env default.
func TestResolveCreateConfigFlagBeatsAppDefault(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := devEnvCreateCmd()
	if err := c.Flags().Parse([]string{"--slug", "x", "--title", "Override"}); err != nil {
		t.Fatal(err)
	}
	cfg, err := resolveCreateConfig(c, &createDefaults{Title: "from-app"})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Title != "Override" {
		t.Fatalf("Title = %q, want flag to win", cfg.Title)
	}
}

func TestResolveCreateConfigFlagsWin(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	// Routed through parseDevEnv (the production argv path) because
	// --multisite is now one of Node's optional-value options: the
	// space-separated `--multisite subdirectory` form is reassembled by the
	// optional-value normalizer, not by pflag.
	c := parseDevEnv(t,
		"create", "--slug", "y", "--title", "My Site", "--multisite", "subdirectory",
		"--php", "8.4", "--wordpress", "6.5", "--phpmyadmin", "--xdebug",
		"--start=false",
	)
	cfg, err := resolveCreateConfig(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Title != "My Site" || cfg.MultisiteMode != "subdirectory" || cfg.PHP != "8.4" || cfg.WordPress != "6.5" {
		t.Fatalf("flags not honored: %+v", cfg)
	}
	if !cfg.PHPMyAdmin || !cfg.Xdebug {
		t.Fatalf("bool flags not honored: %+v", cfg)
	}
	if cfg.Start {
		t.Fatal("--start=false not honored")
	}
}

func TestPHPVersionForLabel(t *testing.T) {
	if phpVersionForLabel("8.2 (recommended)") != "8.2" {
		t.Fatal("recommended label should map to 8.2")
	}
	if phpVersionForLabel("8.5 (experimental)") != "8.5" {
		t.Fatal("experimental label should map to 8.5")
	}
	if phpVersionForLabel("8.4") != "8.4" {
		t.Fatal("plain label should map to its version")
	}
}

func TestParseWordPressTags(t *testing.T) {
	body := []byte(`[
		{"ref":"7.0","tag":"7.0","prerelease":false},
		{"ref":"6.9.4","tag":"6.9","prerelease":false},
		{"ref":"6.9.3","tag":"6.9","prerelease":false},
		{"ref":"","tag":"","prerelease":false}
	]`)
	got := parseWordPressTags(body)
	want := []string{"7.0", "6.9"} // deduped, blank dropped, manifest order kept
	if len(got) != len(want) {
		t.Fatalf("parseWordPressTags = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("parseWordPressTags[%d] = %q, want %q", i, got[i], want[i])
		}
	}
	if parseWordPressTags([]byte("not json")) != nil {
		t.Fatal("invalid JSON should yield nil (caller falls back to trunk)")
	}
}

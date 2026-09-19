package devenv

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

const minimalConfig = "configuration-version: 1\nslug: configured-site\n"

// Register 2.21. Node walks UP from the cwd looking for the dev-env
// configuration file (dev-environment-configuration-file.ts findConfigurationFile).
// vip-next ignored it entirely, so `destroy` in a configured repo targeted
// whatever environment happened to be the only/selected one.
func TestFindConfigFileInCurrentDirectory(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, ".wpvip", "vip-dev-env.yml"), minimalConfig)

	cfg, err := FindConfigFile(dir)
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil {
		t.Fatal("no configuration file found")
	}
	if cfg.Slug != "configured-site" {
		t.Errorf("Slug = %q, want configured-site", cfg.Slug)
	}
	if want := filepath.Join(dir, ".wpvip", "vip-dev-env.yml"); cfg.Path != want {
		t.Errorf("Path = %q, want %q", cfg.Path, want)
	}
}

// Node pushes candidates for the cwd, then its parent, then its parent's
// parent — first readable file wins, so a deep working directory still finds
// the repo-root configuration.
func TestFindConfigFileWalksUp(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".wpvip", "vip-dev-env.yml"), minimalConfig)
	deep := filepath.Join(root, "a", "b", "c")
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatal(err)
	}

	cfg, err := FindConfigFile(deep)
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil || cfg.Slug != "configured-site" {
		t.Fatalf("walk-up did not find the repo-root configuration: %+v", cfg)
	}
}

// The nearest directory wins over an ancestor.
func TestFindConfigFileNearestWins(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".wpvip", "vip-dev-env.yml"), minimalConfig)
	nested := filepath.Join(root, "child")
	writeFile(t, filepath.Join(nested, ".wpvip", "vip-dev-env.yml"),
		"configuration-version: 1\nslug: nested-site\n")

	cfg, err := FindConfigFile(nested)
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil || cfg.Slug != "nested-site" {
		t.Fatalf("nearest configuration must win, got %+v", cfg)
	}
}

// Node also accepts the dotfile form at each level, but `.wpvip/` is checked
// first at the SAME level (locations are pushed in that order).
func TestFindConfigFileDotfileForm(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, ".vip-dev-env.yml"), "configuration-version: 1\nslug: dotfile-site\n")

	cfg, err := FindConfigFile(dir)
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil || cfg.Slug != "dotfile-site" {
		t.Fatalf("dotfile form not found: %+v", cfg)
	}
}

func TestFindConfigFileWpvipBeatsDotfileAtSameLevel(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, ".wpvip", "vip-dev-env.yml"), minimalConfig)
	writeFile(t, filepath.Join(dir, ".vip-dev-env.yml"), "configuration-version: 1\nslug: dotfile-site\n")

	cfg, err := FindConfigFile(dir)
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil || cfg.Slug != "configured-site" {
		t.Fatalf(".wpvip/ must win at the same level, got %+v", cfg)
	}
}

// Node's walk is bounded: `depth < maxDepth` with maxDepth = 64, and it stops
// at the filesystem root (the root directory itself is never inspected).
func TestFindConfigFileStopsAfter64Levels(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".wpvip", "vip-dev-env.yml"), minimalConfig)

	// 64 directories below root: the walk visits the start dir plus 63
	// ancestors, so root itself is out of reach.
	deep := root
	for i := 0; i < 64; i++ {
		deep = filepath.Join(deep, "d")
	}
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatal(err)
	}
	cfg, err := FindConfigFile(deep)
	if err != nil {
		t.Fatal(err)
	}
	if cfg != nil {
		t.Errorf("walk must stop after 64 levels, found %q", cfg.Path)
	}

	// One level shallower is still in range — pins both sides of the bound so
	// the test cannot pass just because the walk is broken.
	inRange := filepath.Dir(deep)
	cfg, err = FindConfigFile(inRange)
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil {
		t.Error("63 levels below the configuration must still find it")
	}
}

func TestFindConfigFileNoneReturnsNil(t *testing.T) {
	cfg, err := FindConfigFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if cfg != nil {
		t.Errorf("expected no configuration file, got %+v", cfg)
	}
}

// Node's sanitizeConfiguration exits with an error when the file lacks
// configuration-version or slug — a broken config must never silently fall
// through to "some other environment" on a destructive command.
func TestFindConfigFileMissingKeysIsFatal(t *testing.T) {
	for name, body := range map[string]string{
		"no version": "slug: x\n",
		"no slug":    "configuration-version: 1\n",
		"a list":     "- configuration-version: 1\n",
	} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			writeFile(t, filepath.Join(dir, ".wpvip", "vip-dev-env.yml"), body)
			_, err := FindConfigFile(dir)
			if err == nil {
				t.Fatal("want an error, got nil")
			}
			if !strings.Contains(err.Error(), "couldn't be loaded") {
				t.Errorf("error = %q, want Node's \"couldn't be loaded\" wording", err)
			}
		})
	}
}

func TestFindConfigFileUnsupportedVersionIsFatal(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, ".wpvip", "vip-dev-env.yml"), "configuration-version: 2\nslug: x\n")
	_, err := FindConfigFile(dir)
	if err == nil || !strings.Contains(err.Error(), "invalid configuration-version") {
		t.Fatalf("error = %v, want Node's invalid configuration-version message", err)
	}
}

func TestFindConfigFileMalformedYAMLIsFatal(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, ".wpvip", "vip-dev-env.yml"), "configuration-version: 1\n\tslug: [\n")
	_, err := FindConfigFile(dir)
	if err == nil || !strings.Contains(err.Error(), "could not be loaded") {
		t.Fatalf("error = %v, want Node's could-not-be-loaded message", err)
	}
}

// FAILSAFE_SCHEMA: Node loads the YAML with the failsafe schema so `php: 8.1`
// parses as the STRING "8.1", not the number 8.1 (which would stringify to
// "8.1" here but "8.10" -> "8.1" elsewhere). Values must stay verbatim.
func TestFindConfigFileKeepsNumberLikeValuesAsStrings(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, ".wpvip", "vip-dev-env.yml"),
		"configuration-version: 1\nslug: x\nphp: 8.10\nwordpress: 6.40\n")
	cfg, err := FindConfigFile(dir)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PHP != "8.10" {
		t.Errorf("PHP = %q, want the verbatim string 8.10", cfg.PHP)
	}
	if cfg.WordPress != "6.40" {
		t.Errorf("WordPress = %q, want the verbatim string 6.40", cfg.WordPress)
	}
}

// adjustRelativePaths resolves app-code / mu-plugins relative to the
// configuration file's directory, leaving the "demo"/"image" keywords alone.
func TestFindConfigFileResolvesRelativeComponentPaths(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, ".wpvip", "vip-dev-env.yml"),
		"configuration-version: 1\nslug: x\napp-code: ../\nmu-plugins: image\n")
	cfg, err := FindConfigFile(dir)
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(dir, ".wpvip", ".."); cfg.AppCode != want {
		t.Errorf("AppCode = %q, want %q", cfg.AppCode, want)
	}
	if cfg.MuPlugins != "image" {
		t.Errorf("MuPlugins = %q, want the image keyword untouched", cfg.MuPlugins)
	}
}

// Node's slug is used verbatim (configuration.slug.toString()); unlike --slug
// it does NOT go through processSlug, so it is not lowercased.
func TestFindConfigFileSlugIsNotLowercased(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, ".wpvip", "vip-dev-env.yml"), "configuration-version: 1\nslug: MixedCase\n")
	cfg, err := FindConfigFile(dir)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Slug != "MixedCase" {
		t.Errorf("Slug = %q, want MixedCase (Node does not processSlug the config value)", cfg.Slug)
	}
}

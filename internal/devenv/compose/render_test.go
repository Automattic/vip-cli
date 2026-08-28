package compose

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

func TestRenderEnvFile(t *testing.T) {
	v := baseView()
	out := RenderEnvFile(v)
	if !strings.Contains(out, "LANDO_HOST_USER_ID=1000") || !strings.Contains(out, "LANDO_HOST_GROUP_ID=1000") {
		t.Fatalf(".env missing host ids:\n%s", out)
	}
}

func TestSetupStepsIncludeChownAndSetup(t *testing.T) {
	v := baseView()
	steps := SetupSteps(v)
	var sawChown, sawSetup bool
	for _, s := range steps {
		if s.AsRoot && strings.Contains(s.Command, "chown www-data:www-data") {
			sawChown = true
		}
		if !s.AsRoot && strings.Contains(s.Command, "/dev-tools/setup.sh") {
			sawSetup = true
			if !strings.Contains(s.Command, `--domain "http://example.vipdev.lndo.site/"`) {
				t.Fatalf("setup.sh domain wrong: %q", s.Command)
			}
		}
	}
	if !sawChown || !sawSetup {
		t.Fatalf("expected chown + setup steps, got %+v", steps)
	}
}

func TestSetupStepsMultisiteFlags(t *testing.T) {
	v := baseView()
	v.MultisiteEnabled = true
	v.MultisiteSubdomain = true
	steps := SetupSteps(v)
	var setup string
	for _, s := range steps {
		if strings.Contains(s.Command, "setup.sh") {
			setup = s.Command
		}
	}
	if !strings.Contains(setup, "--ms-domain") || !strings.Contains(setup, "--subdomain") {
		t.Fatalf("multisite subdomain flags missing: %q", setup)
	}
}

func TestRenderComposeMatchesGolden(t *testing.T) {
	data := &instancedata.InstanceData{
		SiteSlug:   "example",
		WPTitle:    "Example Dev",
		Multisite:  json.RawMessage("false"),
		WordPress:  instancedata.WordPressConfig{Mode: "image", Tag: "trunk"},
		MuPlugins:  instancedata.ComponentConfig{Mode: "image"},
		AppCode:    instancedata.ComponentConfig{Mode: "image"},
		PHP:        "ghcr.io/automattic/vip-container-images/php-fpm:8.2",
		PHPMyAdmin: true,
	}
	v := NewView(data, Options{})
	out, err := RenderCompose(v)
	if err != nil {
		t.Fatalf("RenderCompose: %v", err)
	}

	goldenPath := filepath.Join("testdata", "full.golden.yml")
	if os.Getenv("UPDATE_GOLDEN") == "1" {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(goldenPath, out, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden (run with UPDATE_GOLDEN=1 once to create): %v", err)
	}
	if string(out) != string(want) {
		t.Fatalf("compose output differs from golden.\n--- got ---\n%s\n--- want ---\n%s", out, want)
	}
}

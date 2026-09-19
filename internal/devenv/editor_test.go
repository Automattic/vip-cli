package devenv

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

func TestEditorPathMappingsAppCode(t *testing.T) {
	d := &instancedata.InstanceData{
		MuPlugins: instancedata.ComponentConfig{Mode: "local", Dir: "/srv/mu"},
		AppCode:   instancedata.ComponentConfig{Mode: "local", Dir: "/srv/app"},
	}
	m := editorPathMappings("/loc", d)
	if m["/wp/wp-content/mu-plugins"] != "/srv/mu" {
		t.Fatalf("mu-plugins mapping wrong: %v", m)
	}
	if m["/wp/wp-content/plugins"] != "/srv/app/plugins" {
		t.Fatalf("plugins mapping wrong: %v", m)
	}
	if m["/wp"] != "/loc/wordpress" {
		t.Fatalf("/wp mapping wrong: %v", m)
	}
}

func TestGenerateEditorWorkspace(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("ws", &instancedata.InstanceData{SiteSlug: "ws", Multisite: []byte("false")}); err != nil {
		t.Fatal(err)
	}
	path, err := GenerateEditorWorkspace("ws", "cursor")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(path, "ws.code-workspace") {
		t.Fatalf("unexpected workspace path: %s", path)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var ws map[string]any
	if err := json.Unmarshal(b, &ws); err != nil {
		t.Fatalf("workspace not valid JSON: %v", err)
	}
	if _, ok := ws["folders"]; !ok {
		t.Fatal("workspace missing folders")
	}
	if filepath.Base(path) != "ws.code-workspace" {
		t.Fatal("workspace filename wrong")
	}
	// Unsupported editor errors.
	if _, err := GenerateEditorWorkspace("ws", "phpstorm"); err == nil {
		t.Fatal("phpstorm should be unsupported")
	}
}

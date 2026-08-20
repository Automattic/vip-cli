package devenv

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/devenv/paths"
)

// vscodeStyleEditors share the .code-workspace format (Node SUPPORTED_EDITORS).
var vscodeStyleEditors = map[string]bool{"vscode": true, "cursor": true, "windsurf": true}

// GenerateEditorWorkspace writes an editor workspace file for the env and
// returns its path (Node `start --editor=<name>`). Ports generateVSCodeWorkspace:
// a .code-workspace with the env + local code folders and an Xdebug launch
// config (port 9003) with container→host path mappings. vscode/cursor/windsurf
// share the format; phpstorm (a different .iml format) is not yet supported.
func GenerateEditorWorkspace(slug, editor string) (string, error) {
	if !vscodeStyleEditors[editor] {
		return "", fmt.Errorf("devenv: --editor=%s is not supported yet; use vscode, cursor, or windsurf", editor)
	}
	d, err := instancedata.Read(slug)
	if err != nil {
		return "", err
	}
	location := paths.EnvironmentPath(slug)

	folders := []map[string]string{{"path": location}}
	if d.MuPlugins.Dir != "" {
		folders = append(folders, map[string]string{"path": d.MuPlugins.Dir})
	}
	if d.AppCode.Dir != "" {
		folders = append(folders, map[string]string{"path": d.AppCode.Dir})
	}

	workspace := map[string]any{
		"folders": folders,
		"launch": map[string]any{
			"version": "0.2.0",
			"configurations": []map[string]any{{
				"name":         "Debug " + slug,
				"type":         "php",
				"request":      "launch",
				"port":         9003,
				"pathMappings": editorPathMappings(location, d),
			}},
		},
	}
	b, err := json.MarshalIndent(workspace, "", "  ")
	if err != nil {
		return "", err
	}
	out := filepath.Join(location, slug+".code-workspace")
	if err := os.WriteFile(out, b, 0o644); err != nil {
		return "", err
	}
	return out, nil
}

// editorPathMappings maps container paths to host paths for the Xdebug launch
// config (ports generatePathMappings).
func editorPathMappings(location string, d *instancedata.InstanceData) map[string]string {
	m := map[string]string{}
	if d.MuPlugins.Dir != "" {
		m["/wp/wp-content/mu-plugins"] = d.MuPlugins.Dir
	}
	if d.AppCode.Dir != "" {
		base := d.AppCode.Dir
		m["/wp/wp-content/client-mu-plugins"] = filepath.Join(base, "client-mu-plugins")
		m["/wp/wp-content/images"] = filepath.Join(base, "images")
		m["/wp/wp-content/languages"] = filepath.Join(base, "languages")
		m["/wp/wp-content/plugins"] = filepath.Join(base, "plugins")
		m["/wp/wp-content/private"] = filepath.Join(base, "private")
		m["/wp/wp-content/themes"] = filepath.Join(base, "themes")
		m["/wp/vip-config"] = filepath.Join(base, "vip-config")
	}
	m["/wp"] = filepath.Join(location, "wordpress")
	return m
}

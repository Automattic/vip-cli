package edgeworkers

import (
	"embed"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"fmt"
	"os"
	"path/filepath"
)

//go:embed templates/*
var templates embed.FS

func writeScaffoldFile(file string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
		return err
	}
	return os.WriteFile(file, data, 0644)
}

func ScaffoldProject(dir, projectType string) error {
	if projectType != "assemblyscript" {
		return fmt.Errorf("Unknown edge worker type \"%s\". Supported types: assemblyscript.", projectType)
	}
	if stat, err := os.Lstat(dir); err == nil {
		if !stat.IsDir() {
			return fmt.Errorf("Cannot create an edge-workers project at \"%s\": target is not a directory.", dir)
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return err
		}
		if len(entries) > 0 {
			return fmt.Errorf("Cannot create an edge-workers project at \"%s\": target is not empty.", dir)
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	for _, name := range []string{ProjectFile, "package.json", "tsconfig.json", "gitignore", "README.md"} {
		data, err := templates.ReadFile("templates/" + name)
		if err != nil {
			return err
		}
		target := name
		if name == "gitignore" {
			target = ".gitignore"
		}
		if err := writeScaffoldFile(filepath.Join(dir, target), data); err != nil {
			return err
		}
	}
	return writeScaffoldFile(filepath.Join(dir, WorkersDir, ".gitkeep"), nil)
}

func ScaffoldWorker(projectDir, name string, location *Location) error {
	if err := ValidateWorkerName(name, "worker name"); err != nil {
		return err
	}
	if location != nil {
		if _, err := ParseLocationOption(location.Operator + ":" + location.Value); err != nil {
			return err
		}
	}
	dir := filepath.Join(projectDir, WorkersDir, name)
	if _, err := os.Lstat(dir); err == nil {
		return fmt.Errorf("A worker directory already exists at \"%s\".", dir)
	} else if !os.IsNotExist(err) {
		return err
	}
	manifest := struct {
		Name     string    `json:"name"`
		Entry    string    `json:"entry"`
		Location *Location `json:"location,omitempty"`
	}{name, "assembly/index.ts", location}
	data, err := json.Marshal(manifest, jsontext.WithIndent("\t"))
	if err != nil {
		return err
	}
	if err := writeScaffoldFile(filepath.Join(dir, ManifestFile), append(data, '\n')); err != nil {
		return err
	}
	source, err := templates.ReadFile("templates/worker.ts")
	if err != nil {
		return err
	}
	return writeScaffoldFile(filepath.Join(dir, manifest.Entry), source)
}

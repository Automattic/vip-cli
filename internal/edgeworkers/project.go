package edgeworkers

import (
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/text/cases"
	"golang.org/x/text/collate"
	"golang.org/x/text/language"
)

const ProjectFile = "edge-workers.json"
const ManifestFile = "worker.json"
const WorkersDir = "workers"
const BuildDir = "build"
const ConventionalDir = "edge-workers"

type ProjectDescriptor struct {
	Type string
	SDK  *string
}
type Manifest struct {
	Name, Entry string
	Location    LocationValue
	OnFailure   *string
}
type LocalWorker struct {
	Dir      string
	Manifest Manifest
}

func pathExists(path string) bool { _, err := os.Stat(path); return err == nil }

func ResolveProjectDir(cwd string, explicit *string) (string, error) {
	cwd, err := filepath.Abs(cwd)
	if err != nil {
		return "", err
	}
	if explicit != nil {
		if *explicit == "" {
			return "", errors.New("The --path flag requires a path to the edge-workers project.")
		}
		target := *explicit
		if !filepath.IsAbs(target) {
			target = filepath.Join(cwd, target)
		}
		target = filepath.Clean(target)
		if !pathExists(filepath.Join(target, ProjectFile)) {
			return "", fmt.Errorf("No edge-workers project found at \"%s\" (missing %s).", target, ProjectFile)
		}
		return target, nil
	}
	for current := cwd; ; current = filepath.Dir(current) {
		if pathExists(filepath.Join(current, ProjectFile)) {
			return current, nil
		}
		if filepath.Dir(current) == current {
			break
		}
	}
	conventional := filepath.Join(cwd, ConventionalDir)
	if pathExists(filepath.Join(conventional, ProjectFile)) {
		return conventional, nil
	}
	return "", errors.New("No edge-workers project found here. Run `vip edge-workers init` to create one, run the command from inside a project, or pass `--path` to point at one.")
}

func readProjectJSON(file, label string) (any, error) {
	info, err := os.Lstat(file)
	if err != nil {
		return nil, fmt.Errorf("Could not read %s at \"%s\".", label, file)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("%s at \"%s\" must not be a symbolic link.", label, file)
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, fmt.Errorf("Could not read %s at \"%s\".", label, file)
	}
	var value any
	// JSON.parse accepts duplicate properties (last wins) and replaces invalid UTF-8.
	err = json.Unmarshal(data, &value, jsontext.AllowDuplicateNames(true), jsontext.AllowInvalidUTF8(true))
	if err != nil {
		return nil, fmt.Errorf("%s at \"%s\" is not valid JSON.", strings.ToUpper(label[:1])+label[1:], file)
	}
	return value, nil
}

func ReadProjectDescriptor(projectDir string) (ProjectDescriptor, error) {
	file := filepath.Join(projectDir, ProjectFile)
	value, err := readProjectJSON(file, "project descriptor")
	if err != nil {
		return ProjectDescriptor{}, err
	}
	m, ok := value.(map[string]any)
	if !ok {
		return ProjectDescriptor{}, fmt.Errorf("Project descriptor at \"%s\" has an invalid \"type\" field.", file)
	}
	if _, present := m["type"]; !present {
		return ProjectDescriptor{}, fmt.Errorf("Project descriptor at \"%s\" is missing a \"type\" field.", file)
	}
	if m["type"] != "assemblyscript" {
		return ProjectDescriptor{}, fmt.Errorf("Project descriptor at \"%s\" has an invalid \"type\" field.", file)
	}
	d := ProjectDescriptor{Type: "assemblyscript"}
	if raw, present := m["sdk"]; present {
		sdk, ok := raw.(string)
		if !ok {
			return d, fmt.Errorf("Project descriptor at \"%s\" has an invalid \"sdk\" field.", file)
		}
		d.SDK = &sdk
	}
	return d, nil
}

func ReadManifest(workerDir string) (Manifest, error) {
	file := filepath.Join(workerDir, ManifestFile)
	value, err := readProjectJSON(file, "worker manifest")
	if err != nil {
		return Manifest{}, err
	}
	m, ok := value.(map[string]any)
	if !ok {
		return Manifest{}, fmt.Errorf("Worker manifest at \"%s\" must be an object.", file)
	}
	name, ok := m["name"].(string)
	if !ok {
		raw, present := m["name"]
		return Manifest{}, fmt.Errorf("Invalid worker name \"%s\".", jsString(raw, present))
	}
	if err := ValidateWorkerName(name, "worker name"); err != nil {
		return Manifest{}, err
	}
	entry, ok := m["entry"].(string)
	if !ok || entry == "" {
		return Manifest{}, fmt.Errorf("Worker manifest at \"%s\" is missing an \"entry\" field.", file)
	}
	if _, err := ResolvePathWithin(workerDir, entry, "Worker entry"); err != nil {
		return Manifest{}, err
	}
	manifest := Manifest{Name: name, Entry: entry}
	if raw, present := m["on_failure"]; present {
		policy, ok := raw.(string)
		if !ok || (policy != "continue" && policy != "error") {
			return Manifest{}, fmt.Errorf("Worker manifest at \"%s\" has an invalid \"on_failure\" field.", file)
		}
		manifest.OnFailure = &policy
	}
	if raw, present := m["location"]; present {
		manifest.Location.Present = true
		if raw != nil {
			location, ok := raw.(map[string]any)
			if !ok {
				return Manifest{}, fmt.Errorf("Worker manifest at \"%s\" has an invalid location.", file)
			}
			op, ok := location["operator"].(string)
			if !ok || !validOperator(op) {
				return Manifest{}, fmt.Errorf("Worker manifest at \"%s\" has an invalid location operator.", file)
			}
			val, ok := location["value"].(string)
			if !ok || val == "" || hasTerminalControls(val) {
				return Manifest{}, fmt.Errorf("Worker manifest at \"%s\" has an invalid location value.", file)
			}
			manifest.Location.Value = &Location{Operator: op, Value: val}
		}
	}
	return manifest, nil
}

// jsString is only used to retain Node's validation diagnostics for non-string fields.
func jsString(value any, present bool) string {
	if !present {
		return "undefined"
	}
	if value == nil {
		return "null"
	}
	switch v := value.(type) {
	case string:
		return v
	case map[string]any:
		return "[object Object]"
	case []any:
		parts := make([]string, len(v))
		for i, x := range v {
			if x != nil {
				parts[i] = jsString(x, true)
			}
		}
		return strings.Join(parts, ",")
	default:
		return fmt.Sprint(value)
	}
}

func DiscoverWorkers(projectDir string) ([]LocalWorker, error) {
	root := filepath.Join(projectDir, WorkersDir)
	entries, err := os.ReadDir(root)
	if errors.Is(err, os.ErrNotExist) {
		return []LocalWorker{}, nil
	}
	if err != nil {
		return nil, err
	}
	workers := []LocalWorker{}
	names := map[string]bool{}
	lower := cases.Lower(language.AmericanEnglish)
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(root, e.Name())
		if !pathExists(filepath.Join(dir, ManifestFile)) {
			continue
		}
		m, err := ReadManifest(dir)
		if err != nil {
			return nil, err
		}
		normalized := lower.String(m.Name)
		if names[normalized] {
			return nil, fmt.Errorf("Duplicate worker name \"%s\" found in this project.", m.Name)
		}
		names[normalized] = true
		workers = append(workers, LocalWorker{Dir: dir, Manifest: m})
	}
	order := collate.New(language.AmericanEnglish)
	sort.SliceStable(workers, func(i, j int) bool {
		return order.CompareString(workers[i].Manifest.Name, workers[j].Manifest.Name) < 0
	})
	return workers, nil
}

func FindWorker(projectDir, name string) (LocalWorker, error) {
	workers, err := DiscoverWorkers(projectDir)
	if err != nil {
		return LocalWorker{}, err
	}
	for _, w := range workers {
		if w.Manifest.Name == name {
			return w, nil
		}
	}
	for _, w := range workers {
		if filepath.Base(w.Dir) == name {
			return w, nil
		}
	}
	names := make([]string, len(workers))
	for i, w := range workers {
		names[i] = w.Manifest.Name
	}
	available := strings.Join(names, ", ")
	if available == "" {
		available = "(none)"
	}
	return LocalWorker{}, fmt.Errorf("No worker named \"%s\" found in this project. Available workers: %s.", name, available)
}

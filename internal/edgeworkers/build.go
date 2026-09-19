package edgeworkers

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"golang.org/x/text/encoding/unicode"
)

type Artifact struct {
	Path, Base64 string
	SizeBytes    int64
}
type CompilerRequest struct {
	Binary string
	Args   []string
	Dir    string
	Env    []string
}
type CompilerResult struct {
	Stdout, Stderr string
	ExitCode       int
}
type CompilerRunner func(context.Context, CompilerRequest) (CompilerResult, error)
type Compiler struct{ Run CompilerRunner }

func RunCompiler(ctx context.Context, req CompilerRequest) (CompilerResult, error) {
	// On Windows, execute asc's JS entry through Node rather than cmd.exe: paths
	// and arguments remain literal even when they contain shell metacharacters.
	binary, args := req.Binary, req.Args
	if runtime.GOOS == "windows" {
		binary = "node"
		args = append([]string{filepath.Join(req.Dir, "node_modules", "assemblyscript", "bin", "asc.js")}, args...)
	}
	cmd := exec.CommandContext(ctx, binary, args...)
	cmd.Dir = req.Dir
	cmd.Env = req.Env
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	result := CompilerResult{Stdout: stdout.String(), Stderr: stderr.String()}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		result.ExitCode = exitErr.ExitCode()
		return result, nil
	}
	return result, err
}

func encodeArtifact(file string) (Artifact, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		return Artifact{}, err
	}
	return Artifact{Path: file, Base64: base64.StdEncoding.EncodeToString(data), SizeBytes: int64(len(data))}, nil
}

func (c Compiler) Build(ctx context.Context, projectDir string, w LocalWorker) (Artifact, error) {
	if _, err := ReadProjectDescriptor(projectDir); err != nil {
		return Artifact{}, err
	}
	binName := "asc"
	if runtime.GOOS == "windows" {
		binName = "asc.cmd"
	}
	asc := filepath.Join(projectDir, "node_modules", ".bin", binName)
	if !pathExists(asc) {
		return Artifact{}, fmt.Errorf("The AssemblyScript compiler was not found at \"%s\". Run `npm install` in \"%s\" first.", asc, projectDir)
	}
	candidate, err := ResolvePathWithin(w.Dir, w.Manifest.Entry, "Worker entry")
	if err != nil {
		return Artifact{}, err
	}
	if !pathExists(candidate) {
		return Artifact{}, fmt.Errorf("Worker entry file not found: \"%s\".", candidate)
	}
	entry, err := ResolveExistingPathWithin(w.Dir, w.Manifest.Entry, "Worker entry")
	if err != nil {
		return Artifact{}, err
	}
	if err := ValidateWorkerName(w.Manifest.Name, "worker name"); err != nil {
		return Artifact{}, err
	}
	out, err := ResolveOutputPathWithin(projectDir, filepath.Join(BuildDir, w.Manifest.Name+".wasm"), "Worker build artifact", "Worker build directory")
	if err != nil {
		return Artifact{}, err
	}
	modules := filepath.Join(projectDir, "node_modules")
	args := []string{entry, "--runtime", "stub", "--path", modules, "--outFile", out, "--optimizeLevel", "3", "--shrinkLevel", "2"}
	if pathExists(filepath.Join(modules, "json-as")) {
		args = append(args, "--transform", "json-as/transform")
	}
	env := []string{}
	for _, item := range os.Environ() {
		key, _, _ := strings.Cut(item, "=")
		if key != "NODE_OPTIONS" {
			env = append(env, item)
		}
	}
	run := c.Run
	if run == nil {
		run = RunCompiler
	}
	result, err := run(ctx, CompilerRequest{Binary: asc, Args: args, Dir: projectDir, Env: env})
	if err != nil {
		return Artifact{}, fmt.Errorf("Failed to run the AssemblyScript compiler: %s", err)
	}
	if result.ExitCode != 0 {
		details := result.Stderr
		if details == "" {
			details = result.Stdout
		}
		details = strings.TrimSpace(details)
		suffix := "."
		if details != "" {
			suffix = ":\n" + details
		}
		return Artifact{}, fmt.Errorf("Compilation failed for worker \"%s\"%s", w.Manifest.Name, suffix)
	}
	out, err = ResolveOutputPathWithin(projectDir, filepath.Join(BuildDir, w.Manifest.Name+".wasm"), "Worker build artifact", "Worker build directory")
	if err != nil {
		return Artifact{}, err
	}
	return encodeArtifact(out)
}

func ReadPrebuilt(projectDir string, w LocalWorker) (Artifact, error) {
	if err := ValidateWorkerName(w.Manifest.Name, "worker name"); err != nil {
		return Artifact{}, err
	}
	root, err := ResolvePathWithin(projectDir, BuildDir, "Worker build directory")
	if err != nil {
		return Artifact{}, err
	}
	candidate := filepath.Join(root, w.Manifest.Name+".wasm")
	if !pathExists(candidate) {
		return Artifact{}, fmt.Errorf("No compiled artifact found for \"%s\" at \"%s\". Run `vip edge-workers build` first, or deploy without `--skip-build`.", w.Manifest.Name, candidate)
	}
	for _, item := range []struct{ path, label string }{{root, "Worker build directory"}, {candidate, "Worker build artifact"}} {
		stat, err := os.Lstat(item.path)
		if err != nil {
			return Artifact{}, err
		}
		if stat.Mode()&os.ModeSymlink != 0 {
			return Artifact{}, fmt.Errorf("%s must not be a symbolic link.", item.label)
		}
	}
	root, err = ResolveExistingPathWithin(projectDir, BuildDir, "Worker build directory")
	if err != nil {
		return Artifact{}, err
	}
	file, err := ResolveExistingPathWithin(root, w.Manifest.Name+".wasm", "Worker build artifact")
	if err != nil {
		return Artifact{}, err
	}
	return encodeArtifact(file)
}

func ReadWorkerSource(w LocalWorker) (string, error) {
	candidate, err := ResolvePathWithin(w.Dir, w.Manifest.Entry, "Worker entry")
	if err != nil {
		return "", err
	}
	if !pathExists(candidate) {
		return "", fmt.Errorf("Could not read worker source at \"%s\".", candidate)
	}
	entry, err := ResolveExistingPathWithin(w.Dir, w.Manifest.Entry, "Worker entry")
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(entry)
	if err != nil {
		return "", fmt.Errorf("Could not read worker source at \"%s\".", entry)
	}
	// Match Buffer.toString('utf8'): replace each malformed sequence, not
	// an entire run of malformed bytes (bytes.ToValidUTF8 collapses runs).
	decoded, err := unicode.UTF8.NewDecoder().Bytes(data)
	return string(decoded), err
}

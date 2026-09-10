package update

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func InspectOwnership(ctx context.Context, l Layout) (Ownership, error) {
	return inspectOwnership(ctx, l, runtime.GOOS, func(ctx context.Context, name string, args ...string) ([]byte, error) {
		return exec.CommandContext(ctx, name, args...).Output()
	})
}

type ownershipQuery func(context.Context, string, ...string) ([]byte, error)

func inspectOwnership(ctx context.Context, l Layout, goos string, query ownershipQuery) (Ownership, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	for _, target := range []string{l.CLI, l.Helper} {
		normalized := filepath.ToSlash(target)
		switch goos {
		case "darwin":
			if before, after, ok := strings.Cut(normalized, "/Cellar/"); ok {
				parts := strings.Split(after, "/")
				if len(parts) >= 3 {
					var receipt map[string]any
					path := filepath.Join(before, "Cellar", parts[0], parts[1], "INSTALL_RECEIPT.json")
					if readJSON(path, 1<<20, &receipt) == nil {
						return Ownership{true, "This installation is managed by Homebrew. Run: brew upgrade " + parts[0]}, nil
					}
				}
				return Ownership{true, "This installation is in a Homebrew-managed location; update it with Homebrew."}, nil
			}
		case "windows":
			lower := strings.ToLower(normalized)
			if strings.Contains(lower, "/scoop/apps/") {
				_, after, _ := strings.Cut(lower, "/scoop/apps/")
				parts := strings.Split(after, "/")
				if len(parts) >= 3 {
					dir := filepath.Dir(target)
					var install, manifest map[string]any
					if readJSON(filepath.Join(dir, "install.json"), 1<<20, &install) == nil && readJSON(filepath.Join(dir, "manifest.json"), 1<<20, &manifest) == nil {
						return Ownership{true, "This installation is managed by Scoop. Run: scoop update " + parts[0]}, nil
					}
				}
				return Ownership{true, "Update this installation with Scoop."}, nil
			}
			if strings.Contains(lower, "/windowsapps/") || strings.Contains(lower, "/winget/") {
				return Ownership{true, "This installation is package-managed; update it with its package manager."}, nil
			}
		case "linux":
			for _, manager := range []string{"dpkg-query", "rpm"} {
				args := []string{"-S", target}
				if manager == "rpm" {
					args = []string{"-qf", "--queryformat", "%{NAME}", target}
				}
				data, err := query(ctx, manager, args...)
				if err != nil {
					var ee *exec.ExitError
					if os.IsNotExist(err) || strings.Contains(err.Error(), "executable file not found") {
						continue
					}
					if errors.As(err, &ee) && ee.ExitCode() == 1 {
						continue
					}
					return Ownership{}, fmt.Errorf("could not determine package ownership for %s: %w", target, err)
				}
				pkg := strings.TrimSpace(string(data))
				if manager == "dpkg-query" {
					idx := strings.LastIndex(pkg, ": ")
					if idx < 1 {
						return Ownership{}, fmt.Errorf("invalid package ownership response")
					}
					pkg = pkg[:idx]
				}
				if pkg == "" || strings.ContainsAny(pkg, "\r\n\t ") {
					return Ownership{}, fmt.Errorf("ambiguous package ownership")
				}
				command := "apt install --only-upgrade "
				if manager == "rpm" {
					command = "your RPM package manager to update "
				}
				return Ownership{true, "This installation is package-managed. Use " + command + pkg}, nil
			}
		}
	}
	return Ownership{}, nil
}

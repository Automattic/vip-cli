package edgeworkers

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf16"
)

const LocationOperators = "contains, equals, starts_with, ends_with"

var reservedName = regexp.MustCompile(`(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$`)

func ValidateWorkerName(name, label string) error {
	invalid := name == "" || name == "." || name == ".." || len(utf16.Encode([]rune(name))) > 64 || strings.HasSuffix(name, ".") || strings.HasSuffix(name, " ") || reservedName.MatchString(name)
	for _, r := range name {
		if r <= 31 || strings.ContainsRune(`<>:"/\|?*`, r) {
			invalid = true
		}
	}
	if invalid {
		return fmt.Errorf("Invalid %s \"%s\".", label, name)
	}
	return nil
}

func hasTerminalControls(s string) bool {
	for _, r := range s {
		if r <= 31 || (r >= 127 && r <= 159) {
			return true
		}
	}
	return false
}

func validOperator(s string) bool {
	switch s {
	case "contains", "equals", "starts_with", "ends_with":
		return true
	}
	return false
}

func ParseLocationOption(raw string) (Location, error) {
	op, value, found := strings.Cut(raw, ":")
	if !found || !validOperator(op) || value == "" || hasTerminalControls(value) {
		return Location{}, fmt.Errorf("Invalid location \"%s\". Use \"<operator>:<value>\", where <operator> is one of: %s (e.g. \"starts_with:/api/\").", raw, LocationOperators)
	}
	return Location{Operator: op, Value: value}, nil
}

func isWithin(root, candidate string) bool {
	rel, err := filepath.Rel(root, candidate)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func ResolvePathWithin(root, relative, label string) (string, error) {
	if relative == "" || filepath.IsAbs(relative) {
		return "", fmt.Errorf("%s must be a non-empty relative path.", label)
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	candidate := filepath.Join(abs, relative)
	if !isWithin(abs, candidate) {
		return "", fmt.Errorf("%s must stay within \"%s\".", label, abs)
	}
	return candidate, nil
}

func canonicalPath(target, label string) (string, error) {
	real, err := filepath.EvalSymlinks(target)
	if err != nil {
		return "", fmt.Errorf("%s could not be resolved at \"%s\".", label, target)
	}
	return filepath.Abs(real)
}

func ResolveExistingPathWithin(root, relative, label string) (string, error) {
	candidate, err := ResolvePathWithin(root, relative, label)
	if err != nil {
		return "", err
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	realRoot, err := canonicalPath(abs, label+" root")
	if err != nil {
		return "", err
	}
	real, err := canonicalPath(candidate, label)
	if err != nil {
		return "", err
	}
	if !isWithin(realRoot, real) {
		return "", fmt.Errorf("%s must stay within \"%s\".", label, realRoot)
	}
	return real, nil
}

func ResolveOutputPathWithin(root, relative, fileLabel, directoryLabel string) (string, error) {
	candidate, err := ResolvePathWithin(root, relative, fileLabel)
	if err != nil {
		return "", err
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	realRoot, err := canonicalPath(abs, fileLabel+" root")
	if err != nil {
		return "", err
	}
	parentRel, err := filepath.Rel(abs, filepath.Dir(candidate))
	if err != nil {
		return "", err
	}
	current := abs
	if parentRel != "." {
		for _, component := range strings.Split(parentRel, string(filepath.Separator)) {
			current = filepath.Join(current, component)
			info, err := os.Lstat(current)
			if errors.Is(err, os.ErrNotExist) {
				if err := os.Mkdir(current, 0755); err != nil {
					return "", err
				}
			} else if err != nil {
				return "", err
			} else {
				if info.Mode()&os.ModeSymlink != 0 {
					return "", fmt.Errorf("%s must not be a symbolic link.", directoryLabel)
				}
				if !info.IsDir() {
					return "", fmt.Errorf("%s must be a directory.", directoryLabel)
				}
			}
			real, err := canonicalPath(current, directoryLabel)
			if err != nil {
				return "", err
			}
			if !isWithin(realRoot, real) {
				return "", fmt.Errorf("%s must stay within \"%s\".", directoryLabel, realRoot)
			}
		}
	}
	parent, err := canonicalPath(filepath.Dir(candidate), directoryLabel)
	if err != nil {
		return "", err
	}
	out := filepath.Join(parent, filepath.Base(candidate))
	info, err := os.Lstat(out)
	if errors.Is(err, os.ErrNotExist) {
		return out, nil
	}
	if err != nil {
		return "", err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("%s must not be a symbolic link.", fileLabel)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s must be a regular file.", fileLabel)
	}
	real, err := canonicalPath(out, fileLabel)
	if err != nil {
		return "", err
	}
	if !isWithin(realRoot, real) {
		return "", fmt.Errorf("%s must stay within \"%s\".", fileLabel, realRoot)
	}
	return out, nil
}

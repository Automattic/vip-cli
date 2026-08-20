package customdeploy

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"regexp"
	"strings"
)

// Error messages — validations/custom-deploy.ts:14.
const (
	errMissingThemes = "Missing `themes` directory from root folder."
	errSymlink       = "Symlink detected: "
	errSingleRootDir = "The compressed file must contain a single root directory."
)

const macosxDir = "__MACOSX"

// symlinkIgnoreRE — validations/custom-deploy.ts:22.
var symlinkIgnoreRE = regexp.MustCompile(`/node_modules/[^/]+/\.bin/`)

// Per-entry name patterns — validations/custom-deploy.ts:67.
var (
	invalidDirCharsRE  = regexp.MustCompile(`[!:*?"<>|']|^\.\..*$`)
	invalidFileCharsRE = regexp.MustCompile(`[!/:*?"<>|']|^\.\..*$`)
)

// validateName ports validateName (validations/custom-deploy.ts:62).
func validateName(name string, isDirectory bool) error {
	if strings.HasPrefix(name, "._") {
		return nil
	}
	re := invalidFileCharsRE
	chars := `[!/:*?"<>|'/^..]+`
	if isDirectory {
		re = invalidDirCharsRE
		chars = `[!:*?"<>|'/^..]+`
	}
	if re.MatchString(name) {
		return fmt.Errorf("Filename %s contains disallowed characters: %s", name, chars)
	}
	return nil
}

// ValidateZipFile ports validateZipFile (validations/custom-deploy.ts:143).
func ValidateZipFile(filePath string) error {
	zr, err := zip.OpenReader(filePath)
	if err != nil {
		return fmt.Errorf("Error reading file: %s", err.Error())
	}
	defer zr.Close()

	var rootDirs []string
	for _, f := range zr.File {
		name := f.Name
		if !strings.HasSuffix(name, "/") || strings.HasPrefix(name, macosxDir) {
			continue
		}
		if strings.Count(name, "/") == 1 {
			rootDirs = append(rootDirs, name)
		}
	}
	if len(rootDirs) != 1 {
		return errors.New(errSingleRootDir)
	}
	rootFolder := rootDirs[0]

	// themes/ under the root (validations/custom-deploy.ts:124).
	hasThemes := false
	requiredPrefix := path.Join(rootFolder, "themes") + "/"
	for _, f := range zr.File {
		name := strings.ReplaceAll(f.Name, `\`, "/")
		if strings.HasSuffix(f.Name, "/") && strings.HasPrefix(name, requiredPrefix) {
			hasThemes = true
			break
		}
	}
	if !hasThemes {
		return errors.New(errMissingThemes)
	}

	for _, f := range zr.File {
		if strings.HasPrefix(f.Name, macosxDir) {
			continue
		}
		isDir := strings.HasSuffix(f.Name, "/")
		name := f.Name
		if !isDir {
			name = path.Base(f.Name)
		}
		if err := validateName(name, isDir); err != nil {
			return err
		}
		// Symlink detection: Go's zip reader surfaces the Unix mode bits
		// from the external attributes (the ts:97 case). The DOS-attr
		// variant (ts:92) is not reachable through archive/zip — noted as
		// an intentional gap.
		if symlinkIgnoreRE.MatchString(f.Name) {
			continue
		}
		if f.Mode()&os.ModeSymlink != 0 {
			return errors.New(errSymlink + f.Name)
		}
	}
	return nil
}

// ValidateTarFile ports validateTarFile (validations/custom-deploy.ts:220).
// Handles gzipped (.tar.gz/.tgz) and plain tar input.
func ValidateTarFile(filePath string) error {
	f, err := os.Open(filePath) // #nosec G304 -- user-supplied CLI path
	if err != nil {
		return err
	}
	defer f.Close()

	var r io.Reader = f
	magic := make([]byte, 2)
	if _, err := io.ReadFull(f, magic); err == nil && magic[0] == 0x1f && magic[1] == 0x8b {
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			return err
		}
		zr, err := gzip.NewReader(f)
		if err != nil {
			return err
		}
		defer zr.Close()
		r = zr
	} else {
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			return err
		}
	}

	tr := tar.NewReader(r)
	rootFolder := ""
	type tarEntry struct {
		path  string
		isDir bool
	}
	var entries []tarEntry

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		name := hdr.Name
		if strings.HasPrefix(name, macosxDir) {
			continue
		}
		var isDir, isSymlink bool
		switch hdr.Typeflag {
		case tar.TypeDir:
			isDir = true
		case tar.TypeReg:
		case tar.TypeSymlink, tar.TypeLink:
			isSymlink = hdr.Typeflag == tar.TypeSymlink
			if !isSymlink {
				continue
			}
		default:
			continue
		}

		isRootFolder := isDir && strings.HasSuffix(name, "/") && strings.Count(name, "/") == 1
		if isRootFolder {
			if rootFolder == "" {
				rootFolder = name
			} else if rootFolder != name {
				return errors.New(errSingleRootDir)
			}
		}

		// validateTarEntry (ts:191): symlink check first, then name.
		if isSymlink && !symlinkIgnoreRE.MatchString(name) {
			return errors.New(errSymlink + name)
		}
		if err := validateName(path.Base(strings.TrimSuffix(name, "/")), isDir); err != nil {
			return err
		}
		entries = append(entries, tarEntry{path: name, isDir: isDir})
	}

	if rootFolder == "" {
		return errors.New(errSingleRootDir)
	}

	themesPath := path.Join(rootFolder, "themes") + "/"
	for _, e := range entries {
		if e.isDir && e.path == themesPath {
			return nil
		}
	}
	return errors.New(errMissingThemes)
}

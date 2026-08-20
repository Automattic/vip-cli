// Package customdeploy ports src/lib/custom-deploy/custom-deploy.ts and
// src/lib/validations/custom-deploy.ts — the gates and archive checks
// behind `vip app deploy` (+ `validate`).
package customdeploy

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/Automattic/vip/internal/upload"
)

// DeployMaxFileSize — DEPLOY_MAX_FILE_SIZE = 4 GiB (custom-deploy.ts:11).
const DeployMaxFileSize = int64(4) * 1024 * 1024 * 1024

// DeployInfo mirrors CustomDeployInfo (custom-deploy.ts:14).
type DeployInfo struct {
	AppID             int64
	EnvID             int64
	EnvType           string
	EnvUniqueLabel    string
	PrimaryDomainName string
	Launched          bool
}

// validFilenameRE — validations/custom-deploy.ts:49 (same charset as
// import sql, different message).
var validFilenameRE = regexp.MustCompile(`(?i)^[a-z0-9\-_.]+$`)

// ValidateDeployFilename ports validateFilename (validations/custom-deploy.ts:48).
func ValidateDeployFilename(filename string) error {
	if !validFilenameRE.MatchString(filename) {
		return fmt.Errorf("Filename %s contains disallowed characters: [0-9,a-z,A-Z,-,_,.]", filename)
	}
	return nil
}

// ValidateDeployFileExt ports validateDeployFileExt
// (validations/custom-deploy.ts:31): .zip, .tar.gz, or .tgz.
func ValidateDeployFileExt(filename string) error {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".gz" && strings.ToLower(filepath.Ext(strings.TrimSuffix(filename, filepath.Ext(filename)))) == ".tar" {
		ext = ".tar.gz"
	}
	if ext != ".zip" && ext != ".tar.gz" && ext != ".tgz" {
		return errors.New("Invalid file extension. Please provide a .zip, .tar.gz, or a .tgz file.")
	}
	return nil
}

// ValidateFile ports validateFile (custom-deploy.ts:74): the gate
// sequence ahead of upload. maxSize is injectable for tests; 0 uses the
// 4 GiB production limit.
func ValidateFile(meta upload.FileMeta, maxSize int64) error {
	if maxSize == 0 {
		maxSize = DeployMaxFileSize
	}

	fi, statErr := os.Stat(meta.FileName)
	if statErr != nil {
		return fmt.Errorf("Unable to access file %s", meta.FileName)
	}
	if !meta.IsCompressed {
		return fmt.Errorf("Please compress file %s before uploading.", meta.FileName)
	}
	if err := ValidateDeployFilename(meta.BaseName); err != nil {
		return err
	}
	if err := ValidateDeployFileExt(meta.FileName); err != nil {
		return err
	}
	if f, err := os.Open(meta.FileName); err != nil { // #nosec G304 -- checkFileAccess parity
		return fmt.Errorf("File '%s' does not exist or is not readable.", meta.FileName)
	} else {
		f.Close()
	}
	if fi.IsDir() {
		return fmt.Errorf("Path '%s' is not a file.", meta.FileName)
	}
	if fi.Size() == 0 {
		return fmt.Errorf("File '%s' is empty.", meta.FileName)
	}
	if fi.Size() > maxSize {
		return fmt.Errorf("The deploy file size (%d bytes) exceeds the limit (%d bytes).", fi.Size(), maxSize)
	}
	return nil
}

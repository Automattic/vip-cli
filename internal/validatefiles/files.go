package validatefiles

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// FileValidationResult mirrors ValidationResult (ts:36).
type FileValidationResult struct {
	IntermediateImagesTotal int
	ErrorFileTypes          []string
	ErrorFileNames          []string
	ErrorFileSizes          []string
	ErrorFileNamesCharCount []string
	IntermediateImages      map[string]string // original -> "im1, im2"
}

// ValidateFiles ports validateFiles (ts:50): per-file extension, size,
// sanitized-name, name-length, and intermediate-image checks.
func ValidateFiles(files []string, cfg Config) FileValidationResult {
	res := FileValidationResult{IntermediateImages: map[string]string{}}
	for _, file := range files {
		fi, statErr := os.Stat(file)
		isFolder := statErr == nil && fi.IsDir()

		ext, typ := getExtAndType(file, cfg.AllowedFileTypes)
		// isInvalidFile (ts:114): no type, no ext, or a folder.
		if typ == "" || ext == "" || isFolder {
			res.ErrorFileTypes = append(res.ErrorFileTypes, file)
		}

		// isFileSizeValid (ts:137): limit >= size.
		if statErr == nil && cfg.FileSizeLimitInBytes < fi.Size() {
			res.ErrorFileSizes = append(res.ErrorFileSizes, file)
		}

		if IsFileSanitized(file) {
			res.ErrorFileNames = append(res.ErrorFileNames, file)
		}

		// isFileNameCharCountValid (ts:142): len(basename) <= limit.
		if int64(len(filepath.Base(file))) > cfg.FileNameCharCount {
			res.ErrorFileNamesCharCount = append(res.ErrorFileNamesCharCount, file)
		}

		if original, ok := DoesImageHaveExistingSource(file); ok {
			res.IntermediateImagesTotal++
			if existing, found := res.IntermediateImages[original]; found {
				res.IntermediateImages[original] = existing + ", " + file
			} else {
				res.IntermediateImages[original] = file
			}
		}
	}
	return res
}

// getExtAndType ports getExtAndType (ts:118): first allowed-type key
// whose `(?:\.)(<key>)$` regex (case-insensitive) matches wins.
func getExtAndType(filePath string, allowed map[string]string) (ext, typ string) {
	for key, value := range allowed {
		re, err := regexp.Compile(`(?i)(?:\.)(` + key + `)$`)
		if err != nil {
			continue
		}
		if m := re.FindStringSubmatch(filePath); m != nil {
			return m[1], value
		}
	}
	return "", ""
}

// sanitizeSpacesRE — ts:648's / |(%20)|\+/g.
var sanitizeSpacesRE = regexp.MustCompile(`\x{00A0}|(%20)|\+`)

// IsFileSanitized ports isFileSanitized (ts:641): the name is flagged
// when converting encoded/alternate whitespace to spaces changes it.
func IsFileSanitized(file string) bool {
	filename := filepath.Base(file)
	sanitized := sanitizeSpacesRE.ReplaceAllString(filename, " ")
	return sanitized != filename
}

// intermediateImageRE — ts:672's /([_-])?(\d+x\d+)(@\d+\w)?(\.\w{3,4})$/.
var intermediateImageRE = regexp.MustCompile(`([_-])?(\d+x\d+)(@\d+\w)?(\.\w{3,4})$`)

// DoesImageHaveExistingSource ports doesImageHaveExistingSource (ts:677):
// when the filename looks like an intermediate image AND the original
// (sizing stripped) exists on disk, return the original's path.
func DoesImageHaveExistingSource(file string) (string, bool) {
	filename := filepath.Base(file)
	m := intermediateImageRE.FindString(filename)
	if m == "" {
		return "", false
	}
	extension := strings.TrimPrefix(filepath.Ext(filename), ".")
	baseFileName := strings.Replace(filename, m, "", 1) + "." + extension
	originalImage := filepath.Join(filepath.Dir(file), baseFileName)
	if _, err := os.Stat(originalImage); err == nil {
		return originalImage, true
	}
	return "", false
}

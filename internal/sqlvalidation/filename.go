package sqlvalidation

import (
	"errors"
	"path/filepath"
	"regexp"
	"strings"
)

// validFilenameRE — Node sql.ts:106's /^[a-z0-9\-_.]+$/i.
var validFilenameRE = regexp.MustCompile(`(?i)^[a-z0-9\-_.]+$`)

// ValidateFilename ports validateFilename (sql.ts:105): the import file's
// basename may only contain [0-9 a-z A-Z - _ .].
func ValidateFilename(filename string) error {
	if !validFilenameRE.MatchString(filename) {
		return errors.New("Error: The characters used in the name of a file for import are limited to [0-9,a-z,A-Z,-,_,.]")
	}
	return nil
}

// ValidateImportFileExtension ports validateImportFileExtension
// (sql.ts:98): only .sql and .gz files can be imported.
func ValidateImportFileExtension(fileName string) error {
	ext := strings.ToLower(filepath.Ext(fileName))
	if ext != ".sql" && ext != ".gz" {
		return errors.New("Invalid file extension. Please provide a .sql or .gz file.")
	}
	return nil
}

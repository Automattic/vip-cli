// Package validatefiles ports src/lib/vip-import-validate-files.ts (877
// LOC): the local directory walk, WordPress folder-structure validation,
// per-file checks, and the error/summary reports printed by
// `vip import validate-files`. All output flows through injected
// io.Writers so the command wires stdout/stderr and tests capture
// buffers.
package validatefiles

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/fatih/color"
)

// Config mirrors MediaImportConfig (graphqlTypes) as consumed by
// validateFiles (ts:50).
type Config struct {
	FileNameCharCount    int64
	FileSizeLimitInBytes int64
	AllowedFileTypes     map[string]string // ext -> type label
}

// WalkResult mirrors findNestedDirectories' return (ts:261).
type WalkResult struct {
	Files   []string
	Folders []string // directories that directly contain files, in walk order
}

// hiddenFileRE — ts:276's /(^|\/)\.[^/.]/.
var hiddenFileRE = regexp.MustCompile(`(^|/)\.[^/.]`)

// FindNestedDirectories ports findNestedDirectories (ts:266): recursive
// walk collecting leaf files and the set of directories that directly
// contain files. Hidden entries are filtered. Read errors print the Node
// message to errW and return nil (ts:295-302).
func FindNestedDirectories(directory string, errW io.Writer) *WalkResult {
	res := &WalkResult{}
	seenFolder := map[string]bool{}
	if !walkNested(directory, errW, res, seenFolder) {
		return nil
	}
	return res
}

func walkNested(directory string, errW io.Writer, res *WalkResult, seenFolder map[string]bool) bool {
	entries, err := os.ReadDir(directory)
	if err != nil {
		fmt.Fprintln(errW, color.RedString("✕"),
			fmt.Sprintf(" Error: Cannot read nested directory: %s. Reason: %s", directory, err.Error()))
		return false
	}
	for _, entry := range entries {
		if hiddenFileRE.MatchString(entry.Name()) {
			continue
		}
		filePath := filepath.Join(directory, entry.Name())
		if entry.IsDir() {
			// Node ignores the recursive call's failure (it only aborts
			// the top-level call); mirror by continuing on sub-failure.
			walkNested(filePath, errW, res, seenFolder)
			continue
		}
		if !seenFolder[directory] {
			seenFolder[directory] = true
			res.Folders = append(res.Folders, directory)
		}
		res.Files = append(res.Files, filePath)
	}
	return true
}

// indexPositions mirrors getIndexPositionOfFolders (ts:330).
type indexPositions struct {
	uploadsIndex int // -1 when absent (Node indexOf semantics)
	sitesIndex   int
	siteIDIndex  int
	yearIndex    int
	monthIndex   int
	hasSiteID    bool
	hasYear      bool
	hasMonth     bool
}

var (
	regexSiteID = regexp.MustCompile(`/sites/(\d+)`)
	regexYear   = regexp.MustCompile(`\b\d{4}\b`)
	regexMonth  = regexp.MustCompile(`\b\d{2}\b`)
)

func getIndexPositionOfFolders(folderPath string, sites bool) indexPositions {
	pos := indexPositions{uploadsIndex: -1, sitesIndex: -1, siteIDIndex: -1}
	pathMutate := folderPath
	directories := strings.Split(pathMutate, "/")

	pos.uploadsIndex = indexOf(directories, "uploads")

	if sites {
		pos.sitesIndex = indexOf(directories, "sites")
		if m := regexSiteID.FindStringSubmatch(pathMutate); m != nil {
			pos.siteIDIndex = indexOf(directories, m[1])
			pos.hasSiteID = true
			// ts:367 — strip the multisite segment so a 2-digit site ID
			// isn't confused with the month.
			pathMutate = strings.Replace(pathMutate, m[0], "", 1)
		}
	}

	if m := regexYear.FindString(pathMutate); m != "" {
		pos.yearIndex = indexOf(directories, m)
		pos.hasYear = true
	}
	if m := regexMonth.FindString(pathMutate); m != "" {
		pos.monthIndex = indexOf(directories, m)
		pos.hasMonth = true
	}
	return pos
}

func indexOf(list []string, v string) int {
	for i, s := range list {
		if s == v {
			return i
		}
	}
	return -1
}

// singleSiteValidation ports singleSiteValidation (ts:428). Returns the
// folder path when it has structure errors, "" otherwise.
func singleSiteValidation(folderPath string, w io.Writer) string {
	errs := 0
	fmt.Fprintln(w, color.New(color.Bold).Sprint("Folder:"), color.CyanString(folderPath))
	pos := getIndexPositionOfFolders(folderPath, false)

	if pos.uploadsIndex == 0 {
		fmt.Fprintln(w)
		fmt.Fprintln(w, "✅ File structure: Uploads directory exists")
	} else {
		fmt.Fprintln(w)
		fmt.Fprintln(w, color.YellowString("✕"), "Recommended: Media files should reside in an",
			color.MagentaString("`uploads`"), "directory")
		errs++
	}

	// Node: `if (yearIndex && yearIndex === 1)` — index 0 would be falsy,
	// but uploads occupies 0 in valid layouts so === 1 is the real gate.
	if pos.hasYear && pos.yearIndex == 1 {
		fmt.Fprintln(w, "✅ File structure: Year directory exists (format: YYYY)")
	} else {
		fmt.Fprintln(w, color.YellowString("✕"), "Recommended: Structure your WordPress media files into",
			color.MagentaString("`uploads/YYYY`"), "directories")
		errs++
	}

	if pos.hasMonth && pos.monthIndex == 2 {
		fmt.Fprintln(w, "✅ File structure: Month directory exists (format: MM)")
		fmt.Fprintln(w)
	} else {
		fmt.Fprintln(w, color.YellowString("✕"), "Recommended: Structure your WordPress media files into",
			color.MagentaString("`uploads/YYYY/MM`"), "directories")
		fmt.Fprintln(w)
		errs++
	}

	if errs > 0 {
		return folderPath
	}
	return ""
}

// multiSiteValidation ports multiSiteValidation (ts:504).
func multiSiteValidation(folderPath string, w io.Writer) string {
	errs := 0
	fmt.Fprintln(w, color.New(color.Bold).Sprint("Folder:"), color.CyanString(folderPath))
	pos := getIndexPositionOfFolders(folderPath, true)

	if pos.uploadsIndex == 0 {
		fmt.Fprintln(w)
		fmt.Fprintln(w, "✅ File structure: Uploads directory exists")
	} else {
		fmt.Fprintln(w)
		fmt.Fprintln(w, color.YellowString("✕"), "Recommended: Media files should reside in an",
			color.MagentaString("`uploads`"), "directory")
		errs++
	}

	if pos.sitesIndex == 1 {
		fmt.Fprintln(w, "✅ File structure: Sites directory exists")
	} else {
		fmt.Fprintln(w)
		fmt.Fprintln(w, color.YellowString("✕"), "Recommended: Media files should reside in an",
			color.MagentaString("`sites`"), "directory")
		errs++
	}

	if pos.hasSiteID && pos.siteIDIndex == 2 {
		fmt.Fprintln(w, "✅ File structure: Site ID directory exists")
	} else {
		fmt.Fprintln(w, color.YellowString("✕"), "Recommended: Structure your WordPress media files into",
			color.MagentaString("`uploads/sites/<siteID>`"), "directories")
		errs++
	}

	if pos.hasYear && pos.yearIndex == 3 {
		fmt.Fprintln(w, "✅ File structure: Year directory exists (format: YYYY)")
	} else {
		fmt.Fprintln(w, color.YellowString("✕"), "Recommended: Structure your WordPress media files into",
			color.MagentaString("`uploads/sites/<siteID>/YYYY`"), "directories")
		errs++
	}

	if pos.hasMonth && pos.monthIndex == 4 {
		fmt.Fprintln(w, "✅ File structure: Month directory exists (format: MM)")
		fmt.Fprintln(w)
	} else {
		fmt.Fprintln(w, color.YellowString("✕"), "Recommended: Structure your WordPress media files into",
			color.MagentaString("`uploads/sites/<siteID>/YYYY/MM`"), "directories")
		fmt.Fprintln(w)
		errs++
	}

	if errs > 0 {
		return folderPath
	}
	return ""
}

// FolderStructureValidation ports folderStructureValidation (ts:603):
// validate each folder (multisite when the path contains "sites"),
// returning the offending paths; prints the recommended-structure block
// when any folder failed.
func FolderStructureValidation(folders []string, w io.Writer) []string {
	var allErrors []string
	for _, folderPath := range folders {
		var bad string
		if strings.Contains(folderPath, "sites") {
			bad = multiSiteValidation(folderPath, w)
		} else {
			bad = singleSiteValidation(folderPath, w)
		}
		if bad != "" {
			allErrors = append(allErrors, bad)
		}
	}
	if len(allErrors) > 0 {
		recommendedFileStructure(w)
	}
	return allErrors
}

// recommendedFileStructure ports recommendedFileStructure (ts:206).
func recommendedFileStructure(w io.Writer) {
	underline := color.New(color.Underline)
	fmt.Fprintln(w,
		underline.Sprint("We recommend the WordPress default folder structure for your media files: \n\n")+
			underline.Sprint("Single sites:")+
			color.YellowString("`uploads/year/month/image.png`\n")+
			" e.g.-"+
			color.YellowString("`uploads/2020/06/image.png`\n")+
			underline.Sprint("Multisites:")+
			color.CyanString("`uploads/sites/siteID/year/month/image.png`\n")+
			" e.g.-"+
			color.CyanString("`uploads/sites/5/2020/06/images.png`\n"))
	fmt.Fprintln(w, "------------------------------------------------------------")
	fmt.Fprintln(w)
}

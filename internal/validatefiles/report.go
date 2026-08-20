package validatefiles

import (
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/fatih/color"
)

// Error types — ValidateFilesErrors (ts:13).
const (
	ErrInvalidTypes          = "invalid_types"
	ErrIntermediateImages    = "intermediate_images"
	ErrInvalidSizes          = "invalid_sizes"
	ErrInvalidNames          = "invalid_names"
	ErrInvalidNameCharCounts = "invalid_name_character_counts"
)

// acceptedCharacters — ts:159 (Set-deduplicated; the duplicate backtick
// in the Node literal collapses).
var acceptedCharacters = []string{
	"Non-English characters", "(", ")", "[", "]", "~", "&", "#", "%", "=",
	"’", "'", "×", "@", "`", "?", "*", "!", "\"", "\\", "<", ">", ":",
	";", ",", "/", "$", "|", "{", "}", "spaces",
}

// prohibitedCharacters — ts:196.
var prohibitedCharacters = []string{"+", "%20"}

// recommendAcceptableFileTypes ports ts:225.
func recommendAcceptableFileTypes(w io.Writer, allowedFileTypes string) {
	fmt.Fprintln(w, "Accepted file types: \n\n"+color.MagentaString(allowedFileTypes))
	fmt.Fprintln(w)
}

// recommendAcceptableFileNames ports ts:231.
func recommendAcceptableFileNames(w io.Writer) {
	allowed := strings.Join(acceptedCharacters, " ")
	notAllowed := strings.Join(prohibitedCharacters, " ")
	fmt.Fprintln(w,
		"The following characters are allowed in file names:\n"+
			color.GreenString("All special characters, including: "+allowed+"\n\n")+
			"The following characters are prohibited in file names:\n"+
			color.RedString("Encoded or alternate whitespace, such as "+notAllowed+", are converted to proper spaces\n"))
}

// LogErrorsOptions mirrors LogErrorOptions (ts:21). AllowedTypes feeds
// the invalid-types recommendation; Limit the size/char-count messages;
// IntermediateImages the duplicate-files detail.
type LogErrorsOptions struct {
	ErrorType          string
	InvalidFiles       []string
	AllowedTypes       []string
	Limit              int64
	IntermediateImages map[string]string
}

// LogErrors ports logErrors (ts:709).
func LogErrors(w io.Writer, o LogErrorsOptions) {
	if len(o.InvalidFiles) == 0 {
		return
	}
	for _, file := range o.InvalidFiles {
		switch o.ErrorType {
		case ErrInvalidTypes:
			fmt.Fprintln(w, color.RedString("✕"), "File extensions: Invalid file type for file: ",
				color.CyanString(file))
			fmt.Fprintln(w)
			recommendAcceptableFileTypes(w, strings.Join(o.AllowedTypes, ","))
		case ErrIntermediateImages:
			fmt.Fprintln(w, color.RedString("✕"),
				"Intermediate images: Duplicate files found:\n"+
					"Original file: "+color.BlueString(file+"\n")+
					"Intermediate images: "+color.CyanString(o.IntermediateImages[file]+"\n"))
		case ErrInvalidSizes:
			fmt.Fprintln(w, color.RedString("✕"),
				fmt.Sprintf("File size cannot be more than %g GB", float64(o.Limit)/1024/1024/1024),
				color.CyanString(file))
			fmt.Fprintln(w)
		case ErrInvalidNameCharCounts:
			fmt.Fprintln(w, color.RedString("✕"),
				fmt.Sprintf("File name cannot have more than %d characters", o.Limit),
				color.CyanString(file))
		case ErrInvalidNames:
			fmt.Fprintln(w, color.RedString("✕"), "Character validation: Invalid filename for file: ",
				color.CyanString(file))
			recommendAcceptableFileNames(w)
		default:
			fmt.Fprintln(w, color.RedString("✕"), "Unknown error type:", o.ErrorType)
		}
	}
	fmt.Fprintln(w)
}

// SortedKeys returns map keys sorted — Object.keys order in Node is
// insertion order, which a Go map can't reproduce; sorted keeps output
// deterministic for tests and humans.
func SortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// SummaryParams mirrors SummaryLogsParams (ts:766).
type SummaryParams struct {
	FolderErrorsLength            int
	IntImagesErrorsLength         int
	FileTypeErrorsLength          int
	FileErrorFileSizesLength      int
	FilenameErrorsLength          int
	FileNameCharCountErrorsLength int
	TotalFiles                    int
	TotalFolders                  int
}

// SummaryLogs ports summaryLogs (ts:777). Two Node copy bugs are kept
// deliberately: the sizes line prints fileTypeErrorsLength (ts:833) and
// the char-count line prints filenameErrorsLength (ts:862).
func SummaryLogs(w io.Writer, p SummaryParams) {
	var messages []string

	if p.FolderErrorsLength > 0 {
		messages = append(messages, color.New(color.BgYellow).Sprint(" RECOMMENDED ")+
			color.New(color.Bold, color.FgYellow).Sprintf(" %d folders, ", p.FolderErrorsLength)+
			fmt.Sprintf("%d folders total", p.TotalFolders))
	} else {
		messages = append(messages, color.New(color.BgGreen).Sprint("    PASS     ")+
			color.New(color.Bold, color.FgGreen).Sprintf(" %d folders, ", p.TotalFolders)+
			fmt.Sprintf("%d folders total", p.TotalFolders))
	}

	badge := func(bad bool) string {
		if bad {
			return color.New(color.FgWhite, color.BgRed).Sprint("   ERROR     ")
		}
		return color.New(color.FgWhite, color.BgGreen).Sprint("    PASS     ")
	}
	line := func(bad bool, detail string) string {
		colored := color.GreenString(detail)
		if bad {
			colored = color.RedString(detail)
		}
		return badge(bad) + colored + fmt.Sprintf(", %d files total", p.TotalFiles)
	}

	messages = append(messages, line(p.IntImagesErrorsLength > 0,
		fmt.Sprintf(" %d intermediate images", p.IntImagesErrorsLength)))
	messages = append(messages, line(p.FileTypeErrorsLength > 0,
		fmt.Sprintf(" %d invalid file extensions", p.FileTypeErrorsLength)))
	// Node bug (ts:833): prints fileTypeErrorsLength in the sizes line.
	messages = append(messages, line(p.FileErrorFileSizesLength > 0,
		fmt.Sprintf(" %d invalid file sizes", p.FileTypeErrorsLength)))
	messages = append(messages, line(p.FilenameErrorsLength > 0,
		fmt.Sprintf(" %d invalid filenames", p.FilenameErrorsLength)))
	// Node bug (ts:862): prints filenameErrorsLength in the char-count line.
	if p.FileNameCharCountErrorsLength > 0 {
		messages = append(messages, badge(true)+
			color.RedString(fmt.Sprintf(" %d file names reached the maximum character count limit ", p.FilenameErrorsLength))+
			fmt.Sprintf(", %d files total", p.TotalFiles))
	} else {
		messages = append(messages, color.New(color.BgGreen).Sprint("    PASS     ")+
			color.GreenString(fmt.Sprintf(" %d file names reached the maximum character count limit", p.FilenameErrorsLength))+
			fmt.Sprintf(", %d files total", p.TotalFiles))
	}

	fmt.Fprintf(w, "\n%s\n\n", strings.Join(messages, "\n"))
}

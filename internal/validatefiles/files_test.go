package validatefiles

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestIsFileSanitized(t *testing.T) {
	for name, want := range map[string]bool{
		"a+b.jpg":   true,
		"a%20b.jpg": true,
		"a b.jpg":   false, // plain space is fine
		"a b.jpg":   true,  // no-break space
		"clean.jpg": false,
	} {
		if got := IsFileSanitized(name); got != want {
			t.Errorf("IsFileSanitized(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestDoesImageHaveExistingSource(t *testing.T) {
	dir := t.TempDir()
	mk := func(name string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
		return p
	}
	original := mk("panda.jpg")
	intermediate := mk("panda-4000x6000.jpg")
	orphan := mk("lonely-300x200.jpg")
	retinaOriginal := mk("panda_test.jpg")
	retina := mk("panda_test-4000x6000@2x.jpg")
	_ = retinaOriginal

	if got, ok := DoesImageHaveExistingSource(intermediate); !ok || got != original {
		t.Errorf("intermediate: got %q ok=%v", got, ok)
	}
	if _, ok := DoesImageHaveExistingSource(orphan); ok {
		t.Error("orphan intermediate must not match (no original on disk)")
	}
	if got, ok := DoesImageHaveExistingSource(retina); !ok || !strings.HasSuffix(got, "panda_test.jpg") {
		t.Errorf("retina: got %q ok=%v", got, ok)
	}
	if _, ok := DoesImageHaveExistingSource(original); ok {
		t.Error("original is not an intermediate image")
	}
}

func TestValidateFiles(t *testing.T) {
	dir := t.TempDir()
	mk := func(name, content string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		return p
	}
	good := mk("good.jpg", "x")
	badExt := mk("script.exe", "x")
	tooBig := mk("big.jpg", strings.Repeat("x", 50))
	badName := mk("a+b.jpg", "x")
	longName := mk(strings.Repeat("n", 30)+".jpg", "x")
	original := mk("img.png", "x")
	intermediate := mk("img-100x100.png", "x")

	cfg := Config{
		FileNameCharCount:    20,
		FileSizeLimitInBytes: 40,
		AllowedFileTypes:     map[string]string{"jpg": "image/jpeg", "png": "image/png"},
	}
	res := ValidateFiles([]string{good, badExt, tooBig, badName, longName, original, intermediate}, cfg)

	if len(res.ErrorFileTypes) != 1 || res.ErrorFileTypes[0] != badExt {
		t.Errorf("ErrorFileTypes = %v", res.ErrorFileTypes)
	}
	if len(res.ErrorFileSizes) != 1 || res.ErrorFileSizes[0] != tooBig {
		t.Errorf("ErrorFileSizes = %v", res.ErrorFileSizes)
	}
	if len(res.ErrorFileNames) != 1 || res.ErrorFileNames[0] != badName {
		t.Errorf("ErrorFileNames = %v", res.ErrorFileNames)
	}
	if len(res.ErrorFileNamesCharCount) != 1 || res.ErrorFileNamesCharCount[0] != longName {
		t.Errorf("ErrorFileNamesCharCount = %v", res.ErrorFileNamesCharCount)
	}
	if res.IntermediateImagesTotal != 1 || res.IntermediateImages[original] != intermediate {
		t.Errorf("IntermediateImages = %v (total %d)", res.IntermediateImages, res.IntermediateImagesTotal)
	}
}

func TestSummaryLogsAllPass(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	var buf bytes.Buffer
	SummaryLogs(&buf, SummaryParams{TotalFiles: 10, TotalFolders: 3})
	out := buf.String()
	if strings.Contains(out, "ERROR") || strings.Contains(out, "RECOMMENDED") {
		t.Errorf("all-pass summary contains failures: %q", out)
	}
	if strings.Count(out, "PASS") != 6 {
		t.Errorf("want 6 PASS lines, got %d in %q", strings.Count(out, "PASS"), out)
	}
}

func TestSummaryLogsWithErrors(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	var buf bytes.Buffer
	SummaryLogs(&buf, SummaryParams{
		FolderErrorsLength:   2,
		FileTypeErrorsLength: 3,
		TotalFiles:           10,
		TotalFolders:         5,
	})
	out := buf.String()
	if !strings.Contains(out, "RECOMMENDED") || !strings.Contains(out, "2 folders, 5 folders total") {
		t.Errorf("folder line wrong: %q", out)
	}
	if !strings.Contains(out, "3 invalid file extensions") {
		t.Errorf("extension line wrong: %q", out)
	}
	// Node bug parity (ts:833): sizes line shows fileTypeErrorsLength.
	if !strings.Contains(out, "3 invalid file sizes") {
		t.Errorf("sizes line must reuse fileTypeErrorsLength (Node bug): %q", out)
	}
}

func TestLogErrorsInvalidNames(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	var buf bytes.Buffer
	LogErrors(&buf, LogErrorsOptions{
		ErrorType:    ErrInvalidNames,
		InvalidFiles: []string{"a+b.jpg"},
	})
	out := buf.String()
	if !strings.Contains(out, "Character validation: Invalid filename for file: ") ||
		!strings.Contains(out, "The following characters are allowed in file names:") {
		t.Errorf("out = %q", out)
	}
}

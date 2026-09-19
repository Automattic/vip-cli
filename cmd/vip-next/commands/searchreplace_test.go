package commands

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// fakeSearchReplaceBinary writes a shell stand-in for go-search-replace that
// upper-cases stdin (mirrors internal/searchreplace test harness).
func fakeSearchReplaceBinary(t *testing.T) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("go-search-replace stand-in is a POSIX #!/bin/sh script; not executable on Windows")
	}
	p := filepath.Join(t.TempDir(), "go-search-replace")
	if err := os.WriteFile(p, []byte("#!/bin/sh\ntr 'a-z' 'A-Z'\n"), 0o755); err != nil { // #nosec G306 -- executable test script
		t.Fatal(err)
	}
	return p
}

func TestSearchReplaceMissingFilename(t *testing.T) {
	cmd := SearchReplaceCmd()
	cmd.SetArgs([]string{})
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "You must pass in a filename") {
		t.Errorf("err = %v", err)
	}
}

func TestSearchReplaceMissingPairs(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "in.sql")
	_ = os.WriteFile(f, []byte("x"), 0o644)
	cmd := SearchReplaceCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetArgs([]string{f})
	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "You must provide a pair of strings") {
		t.Errorf("err = %v", err)
	}
}

func TestSearchReplaceStdoutDefault(t *testing.T) {
	bin := fakeSearchReplaceBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	dir := t.TempDir()
	f := filepath.Join(dir, "in.sql")
	_ = os.WriteFile(f, []byte("hello from\n"), 0o644)

	var out bytes.Buffer
	cmd := SearchReplaceCmd()
	cmd.SetOut(&out)
	cmd.SetErr(io.Discard)
	cmd.SetArgs([]string{f, "--search-replace=from,to"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	// The fake binary upper-cases; default output goes to stdout.
	if !strings.Contains(out.String(), "HELLO FROM") {
		t.Errorf("stdout default not honored: %q", out.String())
	}
}

// Parity blocker B2, second half. Node prompts "Are you sure you want to run
// search and replace on your input file? This operation is not reversible."
// and defaults to No (search-and-replace.ts:151-155) whenever inPlace is set
// and batchMode is not — and the standalone bin never passes batchMode
// (vip-search-replace.js:74). vip-next rewrote the file with no prompt at all.
//
// The test process has no TTY, so the confirm cannot be answered: the command
// must refuse and leave the file byte-for-byte intact. Asserting the exit code
// alone would not have caught the old behavior — assert the bytes.
func TestSearchReplaceInPlaceRefusesWithoutConfirmation(t *testing.T) {
	bin := fakeSearchReplaceBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	dir := t.TempDir()
	f := filepath.Join(dir, "in.sql")
	const original = "hello from\n"
	if err := os.WriteFile(f, []byte(original), 0o644); err != nil { // #nosec G306
		t.Fatal(err)
	}

	cmd := SearchReplaceCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetArgs([]string{f, "--search-replace=from,to", "--in-place"})
	if err := cmd.Execute(); err == nil {
		t.Error("expected --in-place to refuse when the confirmation cannot be shown")
	}

	got, err := os.ReadFile(f) // #nosec G304
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != original {
		t.Errorf("file was rewritten without confirmation:\n got %q\nwant %q", got, original)
	}
}

// VIP_NON_INTERACTIVE must not hang or silently proceed either.
func TestSearchReplaceInPlaceRefusesWhenNonInteractive(t *testing.T) {
	bin := fakeSearchReplaceBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	dir := t.TempDir()
	f := filepath.Join(dir, "in.sql")
	const original = "hello from\n"
	if err := os.WriteFile(f, []byte(original), 0o644); err != nil { // #nosec G306
		t.Fatal(err)
	}

	cmd := SearchReplaceCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetArgs([]string{f, "--search-replace=from,to", "--in-place"})
	if err := cmd.Execute(); err == nil {
		t.Error("expected --in-place to refuse under VIP_NON_INTERACTIVE")
	}
	got, _ := os.ReadFile(f) // #nosec G304
	if string(got) != original {
		t.Errorf("file was rewritten under VIP_NON_INTERACTIVE: %q", got)
	}
}

// The confirm is specific to --in-place: --output writes somewhere else, so
// Node never prompts and neither may we.
func TestSearchReplaceOutputFile(t *testing.T) {
	bin := fakeSearchReplaceBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	dir := t.TempDir()
	f := filepath.Join(dir, "in.sql")
	outPath := filepath.Join(dir, "out.sql")
	_ = os.WriteFile(f, []byte("abc\n"), 0o644)

	cmd := SearchReplaceCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetArgs([]string{f, "--search-replace=a,b", "--output=" + outPath})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(outPath)
	if err != nil || !strings.Contains(string(got), "ABC") {
		t.Errorf("output file = %q err=%v", got, err)
	}
}

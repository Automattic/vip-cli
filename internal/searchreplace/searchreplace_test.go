package searchreplace

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// When vip-next is invoked via a symlink (e.g. ~/.local/bin/vip-next ->
// repo/bin/vip-next), os.Executable() returns the symlink path on macOS, so the
// bundled go-search-replace next to the REAL binary must still be found.
func TestLookupBundledFollowsSymlink(t *testing.T) {
	root := t.TempDir()
	realDir := filepath.Join(root, "repo", "bin")
	if err := os.MkdirAll(realDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(realDir, "vip-next"), []byte("x"), 0o755); err != nil { // #nosec G306
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(realDir, "go-search-replace"), []byte("x"), 0o755); err != nil { // #nosec G306
		t.Fatal(err)
	}
	linkDir := filepath.Join(root, "link")
	if err := os.MkdirAll(linkDir, 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(linkDir, "vip-next")
	if err := os.Symlink(filepath.Join(realDir, "vip-next"), link); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}

	got, ok := lookupBundled(link, "go-search-replace")
	if !ok {
		t.Fatal("expected to resolve sibling go-search-replace via the symlink's real dir")
	}
	if filepath.Base(got) != "go-search-replace" || !statExists(got) {
		t.Fatalf("lookupBundled returned %q", got)
	}
}

// fakeBinary writes a script that upper-cases stdin (stand-in for
// go-search-replace; we assert plumbing, not replacement logic).
func fakeBinary(t *testing.T) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake binary script is POSIX-only")
	}
	dir := t.TempDir()
	p := filepath.Join(dir, "go-search-replace")
	script := "#!/bin/sh\ntr 'a-z' 'A-Z'\n"
	if err := os.WriteFile(p, []byte(script), 0o755); err != nil { // #nosec G306 -- executable test script
		t.Fatal(err)
	}
	return p
}

func TestResolveBinaryEnvVarFirst(t *testing.T) {
	bin := fakeBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	got, err := ResolveBinary()
	if err != nil {
		t.Fatal(err)
	}
	if got != bin {
		t.Errorf("got %q want %q", got, bin)
	}
}

func TestResolveBinaryFromPath(t *testing.T) {
	bin := fakeBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", "")
	t.Setenv("PATH", filepath.Dir(bin))
	got, err := ResolveBinary()
	if err != nil {
		t.Fatal(err)
	}
	if got != bin {
		t.Errorf("got %q want %q", got, bin)
	}
}

func TestResolveBinaryMissing(t *testing.T) {
	t.Setenv("VIP_SEARCH_REPLACE_BIN", "")
	t.Setenv("PATH", t.TempDir()) // nothing on PATH
	if _, err := ResolveBinary(); err == nil {
		t.Error("want error when binary is nowhere")
	}
}

func TestRunToOutputFile(t *testing.T) {
	bin := fakeBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	in := write(t, "in.sql", "hello world\n")
	out := filepath.Join(t.TempDir(), "out.sql")

	res, err := Run(in, []string{"from,to"}, Options{Output: out})
	if err != nil {
		t.Fatal(err)
	}
	if res.OutputFileName != out {
		t.Errorf("OutputFileName = %q", res.OutputFileName)
	}
	got, _ := os.ReadFile(out) // #nosec G304
	if strings.TrimSpace(string(got)) != "HELLO WORLD" {
		t.Errorf("output = %q", got)
	}
	if res.UsingStdOut {
		t.Error("UsingStdOut should be false")
	}
}

func TestRunInPlace(t *testing.T) {
	bin := fakeBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	in := write(t, "in.sql", "abc\n")

	res, err := Run(in, []string{"a,b"}, Options{InPlace: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.OutputFileName != in {
		t.Errorf("in-place must overwrite the input; got %q", res.OutputFileName)
	}
	got, _ := os.ReadFile(in) // #nosec G304
	if strings.TrimSpace(string(got)) != "ABC" {
		t.Errorf("content = %q", got)
	}
}

func TestRunDefaultTempOutput(t *testing.T) {
	bin := fakeBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	in := write(t, "in.sql", "q\n")

	res, err := Run(in, []string{"x,y"}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if res.OutputFileName == "" || res.OutputFileName == in {
		t.Errorf("default mode must write a temp copy, got %q", res.OutputFileName)
	}
	if filepath.Base(res.OutputFileName) != "in.sql" {
		t.Errorf("temp file keeps the basename; got %q", res.OutputFileName)
	}
}

func TestRunMyDumperFixApplied(t *testing.T) {
	bin := fakeBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	in := write(t, "in.sql", "-- metadata.header 1\n-- mydb-schema-create.sql 0\n-- wp_posts 123\n")
	out := filepath.Join(t.TempDir(), "out.sql")

	if _, err := Run(in, []string{"a,b"}, Options{Output: out}); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(out) // #nosec G304
	// tr upper-cases first, then the mydumper fix runs on the binary's
	// output: "-- WP_POSTS 123" matches the rewrite pattern.
	if !strings.Contains(string(got), "-- WP_POSTS -1") {
		t.Errorf("mydumper fix not applied: %q", got)
	}
}

func TestRunNoPairs(t *testing.T) {
	in := write(t, "in.sql", "q\n")
	if _, err := Run(in, nil, Options{}); err == nil ||
		err.Error() != "No search and replace parameters provided." {
		t.Errorf("err = %v", err)
	}
}

// failingBinary stands in for go-search-replace rejecting a search-replace
// pair: it writes nothing to stdout and exits non-zero.
func failingBinary(t *testing.T) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake binary script is POSIX-only")
	}
	dir := t.TempDir()
	p := filepath.Join(dir, "go-search-replace")
	script := "#!/bin/sh\necho 'invalid search-replace pair' >&2\nexit 1\n"
	if err := os.WriteFile(p, []byte(script), 0o755); err != nil { // #nosec G306 -- executable test script
		t.Fatal(err)
	}
	return p
}

// Regression for parity blocker B2: `--in-place` used to os.Create() the user's
// own file, truncating it BEFORE the child's result was known, so a rejected
// pair left a 0-byte file. Asserting the exit code alone would not catch this —
// assert the original bytes survive.
func TestRunInPlaceKeepsOriginalBytesWhenChildFails(t *testing.T) {
	bin := failingBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	const original = "CREATE TABLE a;\n"
	in := write(t, "in.sql", original)

	if _, err := Run(in, []string{"from,to"}, Options{InPlace: true}); err == nil {
		t.Fatal("expected an error when go-search-replace fails")
	}

	got, err := os.ReadFile(in) // #nosec G304
	if err != nil {
		t.Fatalf("in-place input file must still exist after a failure: %v", err)
	}
	if string(got) != original {
		t.Errorf("in-place input was destroyed by a failed run:\n got %q\nwant %q", got, original)
	}
}

// A failed run to an explicit --output must not leave a truncated artifact
// behind that a later step could mistake for a real dump.
func TestRunOutputFileNotLeftTruncatedWhenChildFails(t *testing.T) {
	bin := failingBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	in := write(t, "in.sql", "CREATE TABLE a;\n")
	out := filepath.Join(t.TempDir(), "out.sql")

	if _, err := Run(in, []string{"from,to"}, Options{Output: out}); err == nil {
		t.Fatal("expected an error when go-search-replace fails")
	}
	if _, err := os.Stat(out); !os.IsNotExist(err) {
		b, _ := os.ReadFile(out) // #nosec G304
		t.Errorf("failed run left an output file behind (%d bytes: %q)", len(b), b)
	}
}

// The atomic rename must not silently widen or narrow the file's permissions.
func TestRunInPlacePreservesFileMode(t *testing.T) {
	bin := fakeBinary(t)
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)
	in := write(t, "in.sql", "abc\n")
	if err := os.Chmod(in, 0o640); err != nil {
		t.Fatal(err)
	}

	if _, err := Run(in, []string{"a,b"}, Options{InPlace: true}); err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(in)
	if err != nil {
		t.Fatal(err)
	}
	if got := st.Mode().Perm(); got != 0o640 {
		t.Errorf("mode = %o, want 640", got)
	}
}

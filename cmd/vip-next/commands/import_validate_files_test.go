package commands

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"
)

func mediaConfigStub(t *testing.T, configBody string) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(string(body), `"operationName":"MediaImportConfig"`) {
			_, _ = w.Write([]byte(configBody))
			return
		}
		_, _ = w.Write([]byte(`{"data":null}`))
	}))
	t.Cleanup(srv.Close)
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()), APIHost: srv.URL, Token: "tok"})
	t.Cleanup(func() { SetConfig(Config{}) })
}

func TestImportValidateFilesNotADirectory(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	f := filepath.Join(t.TempDir(), "file.txt")
	if err := os.WriteFile(f, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := ImportValidateFilesCmd()
	var stderr bytes.Buffer
	cmd.SetOut(io.Discard)
	cmd.SetErr(&stderr)

	if err := runImportValidateFiles(cmd, []string{f}); err != nil {
		t.Fatalf("must exit 0, got %v", err)
	}
	if !strings.Contains(stderr.String(), "The given path is not a directory. Provide a valid directory path.") {
		t.Errorf("stderr = %q", stderr.String())
	}
}

func TestImportValidateFilesNilConfig(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	mediaConfigStub(t, `{"data":{"mediaImportConfig":null}}`)

	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "uploads/2020/06"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "uploads/2020/06/a.jpg"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := ImportValidateFilesCmd()
	var stderr bytes.Buffer
	cmd.SetOut(io.Discard)
	cmd.SetErr(&stderr)

	if err := runImportValidateFiles(cmd, []string{filepath.Join(root, "uploads")}); err != nil {
		t.Fatalf("must exit 0, got %v", err)
	}
	if !strings.Contains(stderr.String(), "Could not retrieve validation metadata. Please contact VIP Support.") {
		t.Errorf("stderr = %q", stderr.String())
	}
}

func TestImportValidateFilesHappyRun(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	mediaConfigStub(t, `{"data":{"mediaImportConfig":{
		"fileNameCharCount":255,"fileSizeLimitInBytes":1073741824,
		"allowedFileTypes":{"jpg":"image/jpeg","png":"image/png"}}}}`)

	root := t.TempDir()
	// The walk starts at <root>/uploads, so folder paths look like
	// /tmp/.../uploads/2020/06 — "uploads" is NOT index 0 of the split
	// path, mirroring Node behavior for absolute inputs. Structure
	// recommendations fire, file checks pass.
	dir := filepath.Join(root, "uploads/2020/06")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"a.jpg", "b.png"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	cmd := ImportValidateFilesCmd()
	var stdout, stderr bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stderr)

	if err := runImportValidateFiles(cmd, []string{filepath.Join(root, "uploads")}); err != nil {
		t.Fatalf("must exit 0, got %v\nstderr: %s", err, stderr.String())
	}
	out := stdout.String()
	// File-level checks all pass → no ERROR badges; folder structure is
	// "RECOMMENDED" because the absolute path doesn't start at uploads.
	if strings.Contains(out, "ERROR") {
		t.Errorf("unexpected ERROR badge:\n%s", out)
	}
	if !strings.Contains(out, "2 files total") || !strings.Contains(out, "folders total") {
		t.Errorf("summary missing:\n%s", out)
	}
	if !strings.Contains(out, "0 invalid file extensions") {
		t.Errorf("extension pass line missing:\n%s", out)
	}
}

func TestImportValidateFilesFindingsLogged(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	mediaConfigStub(t, `{"data":{"mediaImportConfig":{
		"fileNameCharCount":255,"fileSizeLimitInBytes":1073741824,
		"allowedFileTypes":{"jpg":"image/jpeg"}}}}`)

	root := t.TempDir()
	dir := filepath.Join(root, "uploads/2020/06")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"good.jpg", "evil.exe", "bad+name.jpg"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	cmd := ImportValidateFilesCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)

	if err := runImportValidateFiles(cmd, []string{filepath.Join(root, "uploads")}); err != nil {
		t.Fatalf("must exit 0, got %v", err)
	}
	out := stdout.String()
	if !strings.Contains(out, "File extensions: Invalid file type for file: ") ||
		!strings.Contains(out, "evil.exe") {
		t.Errorf("extension finding missing:\n%s", out)
	}
	if !strings.Contains(out, "Character validation: Invalid filename for file: ") ||
		!strings.Contains(out, "bad+name.jpg") {
		t.Errorf("filename finding missing:\n%s", out)
	}
	if !strings.Contains(out, "1 invalid file extensions") {
		t.Errorf("summary error line missing:\n%s", out)
	}
}

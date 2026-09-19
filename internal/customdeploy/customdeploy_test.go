package customdeploy

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/upload"
)

func metaFor(t *testing.T, name string, content []byte) upload.FileMeta {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(p, content, 0o600); err != nil {
		t.Fatal(err)
	}
	meta, err := upload.GetFileMeta(p)
	if err != nil {
		t.Fatal(err)
	}
	return meta
}

// gzMagic makes content sniff as gzip so IsCompressed is true.
var gzMagic = []byte{0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03}

func TestValidateDeployFileExt(t *testing.T) {
	for name, ok := range map[string]bool{
		"app.zip": true, "app.tar.gz": true, "app.tgz": true, "APP.TGZ": true,
		"app.sql": false, "app.gz": false, "app.tar": false,
	} {
		err := ValidateDeployFileExt(name)
		if ok && err != nil {
			t.Errorf("%s: unexpected err %v", name, err)
		}
		if !ok && (err == nil || !strings.Contains(err.Error(), "Invalid file extension. Please provide a .zip, .tar.gz, or a .tgz file.")) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}

func TestValidateDeployFilename(t *testing.T) {
	if err := ValidateDeployFilename("release-1.2.3.tgz"); err != nil {
		t.Errorf("err = %v", err)
	}
	err := ValidateDeployFilename("bad name!.zip")
	if err == nil || !strings.Contains(err.Error(), "Filename bad name!.zip contains disallowed characters: [0-9,a-z,A-Z,-,_,.]") {
		t.Errorf("err = %v", err)
	}
}

func TestValidateFileGates(t *testing.T) {
	uncompressed := metaFor(t, "app.tgz", []byte("plain text, not gzip"))
	if err := ValidateFile(uncompressed, 0); err == nil ||
		!strings.Contains(err.Error(), "Please compress file") {
		t.Errorf("err = %v", err)
	}

	good := metaFor(t, "app.tgz", gzMagic)
	if err := ValidateFile(good, 0); err != nil {
		t.Errorf("err = %v", err)
	}

	tooBig := metaFor(t, "app.tgz", append(gzMagic, make([]byte, 100)...))
	if err := ValidateFile(tooBig, 10); err == nil ||
		!strings.Contains(err.Error(), "exceeds the limit (10 bytes).") {
		t.Errorf("err = %v", err)
	}

	missing := upload.FileMeta{FileName: filepath.Join(t.TempDir(), "nope.tgz"), BaseName: "nope.tgz", IsCompressed: true}
	if err := ValidateFile(missing, 0); err == nil ||
		!strings.Contains(err.Error(), "Unable to access file") {
		t.Errorf("err = %v", err)
	}

	badExt := metaFor(t, "app.gz", gzMagic)
	if err := ValidateFile(badExt, 0); err == nil ||
		!strings.Contains(err.Error(), "Invalid file extension.") {
		t.Errorf("err = %v", err)
	}
}

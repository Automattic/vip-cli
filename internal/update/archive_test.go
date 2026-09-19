package update

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func tarBytes(t *testing.T, headers []*tar.Header, payloads [][]byte) []byte {
	t.Helper()
	var b bytes.Buffer
	gz := gzip.NewWriter(&b)
	tw := tar.NewWriter(gz)
	for i, h := range headers {
		if err := tw.WriteHeader(h); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write(payloads[i]); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func TestExtractRejectsUnsafeArchives(t *testing.T) {
	for _, h := range []*tar.Header{{Name: "../escaped", Size: 1}, {Name: "/absolute", Size: 1}, {Name: "vip-next", Typeflag: tar.TypeSymlink, Linkname: "/tmp/a"}, {Name: "unexpected", Size: 1}} {
		body := []byte("x")
		if h.Typeflag == tar.TypeSymlink {
			body = nil
		}
		root := t.TempDir()
		archive := filepath.Join(root, "a.tar.gz")
		if err := os.WriteFile(archive, tarBytes(t, []*tar.Header{h}, [][]byte{body}), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := Extract(archive, root, Platform{"linux", "amd64"}); err == nil {
			t.Fatal("accepted", h.Name)
		}
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestStageChecksumAndBytePreservation(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(exe)
	if err != nil {
		t.Fatal(err)
	}
	p := Platform{runtime.GOOS, runtime.GOARCH}
	cli, helper := p.names()
	name, _ := p.archiveName()
	archive := tarBytes(t, []*tar.Header{{Name: cli, Size: int64(len(payload)), Mode: 0755}, {Name: helper, Size: int64(len(payload)), Mode: 0755}}, [][]byte{payload, payload})
	digest := fmt.Sprintf("%x", sha256.Sum256(archive))
	base := "https://github.com/Automattic/vip-cli/releases/download/5.0.1/"
	c := Candidate{Version: "5.0.1", Archive: Asset{Name: name, URL: base + name, Digest: "sha256:" + digest}, Checksum: Asset{Name: name + ".sha256", URL: base + name + ".sha256"}}
	for _, bad := range []bool{true, false} {
		client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			data := archive
			if strings.HasSuffix(r.URL.Path, ".sha256") {
				d := digest
				if bad {
					d = strings.Repeat("0", 64)
				}
				data = []byte(d + " *" + name)
			}
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(data)), ContentLength: int64(len(data)), Request: r}, nil
		})}
		bundle, err := (Downloader{Client: client}).Stage(context.Background(), c, p, t.TempDir())
		if bad {
			if err == nil {
				t.Fatal("bad checksum accepted")
			}
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range []string{bundle.CLI, bundle.Helper} {
			got, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(got, payload) {
				t.Fatal("binary bytes changed", err)
			}
		}
	}
	c.Archive.URL = "https://evil.invalid/payload"
	if _, err := (Downloader{}).Stage(context.Background(), c, p, t.TempDir()); err == nil {
		t.Fatal("foreign URL accepted")
	}
}

func TestStageRejectsMultilineChecksum(t *testing.T) {
	p := Platform{"linux", "amd64"}
	name, _ := p.archiveName()
	base := "https://github.com/Automattic/vip-cli/releases/download/5.0.1/"
	emptySum := fmt.Sprintf("%x", sha256.Sum256(nil))
	c := Candidate{Version: "5.0.1", Archive: Asset{Name: name, URL: base + name}, Checksum: Asset{Name: name + ".sha256", URL: base + name + ".sha256"}}
	archiveRequested := false
	d := Downloader{Client: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := emptySum + "\n" + name
		if !strings.HasSuffix(r.URL.Path, ".sha256") {
			archiveRequested = true
			body = ""
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})}}
	if _, err := d.Stage(context.Background(), c, p, t.TempDir()); err == nil {
		t.Fatal("multiline checksum accepted")
	}
	if archiveRequested {
		t.Fatal("invalid checksum was accepted before fetching the archive")
	}
}

package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	json "encoding/json/v2"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/update"
)

type updateTransport func(*http.Request) (*http.Response, error)

func (f updateTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// The subprocess executes the actual command/service/downloader/installer. Its
// endpoint and installation injection live only in this test, never in the CLI.
func TestUpdateServiceEndToEnd(t *testing.T) {
	if os.Getenv("VIP_UPDATE_TEST_CHILD") != "1" {
		exe, err := os.Executable()
		if err != nil {
			t.Fatal(err)
		}
		cmd := exec.Command(exe, "-test.run=^TestUpdateServiceEndToEnd$")
		cmd.Env = append(os.Environ(), "VIP_UPDATE_TEST_CHILD=1", "DO_NOT_TRACK=1", "GO_ENV=test")
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("update subprocess: %v\n%s", err, output)
		}
		return
	}
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(exe)
	if err != nil {
		t.Fatal(err)
	}
	suffix := ""
	if runtime.GOOS == "windows" {
		suffix = ".exe"
	}
	root := t.TempDir()
	cli := filepath.Join(root, "vip-next"+suffix)
	helper := filepath.Join(root, "go-search-replace"+suffix)
	for _, path := range []string{cli, helper} {
		if err := os.WriteFile(path, []byte("old installation"), 0755); err != nil {
			t.Fatal(err)
		}
	}
	var archive bytes.Buffer
	gz := gzip.NewWriter(&archive)
	tw := tar.NewWriter(gz)
	for _, name := range []string{filepath.Base(cli), filepath.Base(helper)} {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0755, Size: int64(len(payload))}); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write(payload); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	name := "vip-next-" + runtime.GOOS + "-" + runtime.GOARCH + ".tar.gz"
	checksum := fmt.Sprintf("%x *%s", sha256.Sum256(archive.Bytes()), name)
	downloadPath := "/Automattic/vip-cli/releases/download/5.0.1/"
	metadata, err := json.Marshal([]update.Release{{Tag: "5.0.1", Assets: []update.Asset{{Name: name, URL: "https://github.com" + downloadPath + name}, {Name: name + ".sha256", URL: "https://github.com" + downloadPath + name + ".sha256"}}}})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Error("credential reached release server")
		}
		switch r.URL.Path {
		case "/repos/Automattic/vip-cli/releases":
			w.Write(metadata)
		case downloadPath + name:
			w.Write(archive.Bytes())
		case downloadPath + name + ".sha256":
			fmt.Fprint(w, checksum)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	localURL, _ := url.Parse(server.URL)
	client := server.Client()
	transport := client.Transport
	client.Transport = updateTransport(func(r *http.Request) (*http.Response, error) {
		copy := r.Clone(r.Context())
		u := *r.URL
		u.Scheme = localURL.Scheme
		u.Host = localURL.Host
		copy.URL = &u
		return transport.RoundTrip(copy)
	})
	service := update.NewService()
	service.Installed = "5.0.0"
	service.State = update.State{CacheDir: t.TempDir(), ConfigDir: t.TempDir()}
	service.Executable = func() (string, error) { return cli, nil }
	service.Fetch = (update.GitHub{Client: client, BaseURL: server.URL}).Releases
	service.Stage = (update.Downloader{Client: client}).Stage
	service.Installer.InspectOwnership = func(context.Context, update.Layout) (update.Ownership, error) { return update.Ownership{}, nil }
	deps := runDeps{UpdateRunner: service, NewKeychain: func(string) *keychain.Keychain { t.Fatal("updater accessed VIP credentials"); return nil }, NewLogin: func(*auth.Store) func() (*auth.Token, error) { t.Fatal("updater requested login"); return nil }}
	if err := runWithDeps([]string{"update", "--channel", "stable", "--non-interactive"}, deps); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{cli, helper} {
		got, err := os.ReadFile(path)
		if err != nil || !bytes.Equal(got, payload) {
			t.Fatalf("bundle not fully installed: %s %v", path, err)
		}
	}
	ch, err := service.State.ReadChannel()
	if err != nil || ch != update.Stable {
		t.Fatal("channel not persisted", ch, err)
	}
}

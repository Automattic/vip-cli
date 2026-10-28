package update

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func installerRelease(version string) Release {
	r := Release{Tag: version, Prerelease: strings.Contains(version, "-")}
	for _, name := range []string{"vip-next-darwin-arm64.tar.gz", "vip-next-darwin-arm64.pkg", "vip-next-darwin-amd64.pkg", "vip-next-windows-amd64.msi"} {
		for _, suffix := range []string{"", ".sha256"} {
			r.Assets = append(r.Assets, Asset{Name: name + suffix, URL: ReleasesURL + "/download/" + version + "/" + name + suffix})
		}
	}
	return r
}

func TestNativeInstallerAssets(t *testing.T) {
	for _, tc := range []struct {
		platform Platform
		name     string
	}{
		{Platform{"darwin", "arm64"}, "vip-next-darwin-arm64.pkg"},
		{Platform{"darwin", "amd64"}, "vip-next-darwin-amd64.pkg"},
		{Platform{"windows", "amd64"}, "vip-next-windows-amd64.msi"},
	} {
		asset, checksum, err := nativeInstallerAssets("5.0.1", tc.platform, []Release{installerRelease("5.0.1")})
		if err != nil || asset.Name != tc.name || checksum.Name != tc.name+".sha256" {
			t.Fatal(tc.platform, asset, checksum, err)
		}
	}
	for _, tc := range []struct {
		name   string
		change func(*Release)
		want   string
	}{
		{"missing package", func(r *Release) { r.Assets = r.Assets[:2] }, "no complete"},
		{"missing checksum", func(r *Release) { r.Assets = r.Assets[:3] }, "no complete"},
		{"duplicate package", func(r *Release) { r.Assets = append(r.Assets, r.Assets[2]) }, "duplicate"},
		{"duplicate checksum", func(r *Release) { r.Assets = append(r.Assets, r.Assets[3]) }, "duplicate"},
		{"foreign URL", func(r *Release) { r.Assets[2].URL = "https://example.com/installer.pkg" }, "official release asset URL"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := installerRelease("5.0.1")
			tc.change(&r)
			if _, _, err := nativeInstallerAssets("5.0.1", Platform{"darwin", "arm64"}, []Release{r}); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatal(err)
			}
		})
	}
}

// Exercise real ownership, HTTPS downloads, verification, and persistence;
// substitute only release discovery and the native GUI launch.
func TestNativeInstallerUpdate(t *testing.T) {
	for _, tc := range []struct {
		name, version, wantErr string
		opened                 bool
	}{
		{"stable", "5.0.1", "", true},
		{"preview", "5.1.0-beta.1", "", true},
		{"noninteractive", "5.1.0-beta.1", "", false},
		{"check", "5.1.0-beta.1", "", false},
		{"missing preview installer", "5.1.0-beta.1", "no complete", false},
		{"checksum", "5.1.0-beta.1", "checksum mismatch", false},
		{"digest", "5.1.0-beta.1", "digest mismatch", false},
		{"launch", "5.1.0-beta.1", "desktop unavailable", true},
		{"preferences", "5.1.0-beta.1", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			l, _ := installFixture(t)
			marker := filepath.Join(filepath.Dir(l.CLI), ".vip-next-installer.json")
			original := map[string]string{l.CLI: "old-cli", l.Helper: "old-helper", marker: `{"schema":1,"manager":"pkg"}`}
			if err := os.WriteFile(marker, []byte(original[marker]), 0644); err != nil {
				t.Fatal(err)
			}
			preview := installerRelease("5.1.0-beta.1")
			payload := "native installer payload"
			preview.Assets[2].Digest = fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(payload)))
			if tc.name == "digest" {
				preview.Assets[2].Digest = "sha256:" + strings.Repeat("0", 64)
			}
			if tc.name == "missing preview installer" || tc.name == "check" {
				preview.Assets = preview.Assets[:2]
			}
			s := Service{
				Installed: "5.0.0", Platform: Platform{"darwin", "arm64"},
				State:      State{CacheDir: t.TempDir(), ConfigDir: t.TempDir()},
				Executable: func() (string, error) { return l.CLI, nil },
				Fetch:      func(context.Context) ([]Release, error) { return []Release{installerRelease("5.0.1"), preview}, nil },
			}
			s.Installer.InspectOwnership = func(ctx context.Context, l Layout) (Ownership, error) { return inspectOwnership(ctx, l, "darwin", nil) }
			if tc.name == "preferences" {
				s.State.ConfigDir = l.CLI // An existing file makes saving the preference fail.
			}
			download := "/Automattic/vip-cli/releases/download/" + tc.version + "/vip-next-darwin-arm64.pkg"
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if !tc.opened && tc.wantErr == "" {
					t.Error("informational run downloaded a package")
				}
				switch r.URL.Path {
				case download:
					fmt.Fprint(w, payload)
				case download + ".sha256":
					sum := fmt.Sprintf("%x", sha256.Sum256([]byte(payload)))
					if tc.name == "checksum" {
						sum = strings.Repeat("0", 64)
					}
					fmt.Fprintf(w, "%s *vip-next-darwin-arm64.pkg", sum)
				default:
					t.Errorf("unexpected download: %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			client, local := server.Client(), server.URL
			transport := client.Transport
			client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
				copy := r.Clone(r.Context())
				copy.URL, _ = url.Parse(local + r.URL.Path)
				return transport.RoundTrip(copy)
			})
			s.NativeInstaller.Downloader.Client = client
			opened := ""
			s.NativeInstaller.Open = func(_ context.Context, path string) error {
				opened = path
				if tc.name == "launch" {
					return errors.New("desktop unavailable")
				}
				return nil
			}
			req := Request{Interactive: tc.name != "noninteractive", CheckOnly: tc.name == "check", Channel: Preview, ExplicitChannel: true}
			if tc.name == "stable" {
				req.Channel = Stable
			}
			out, err := s.Run(context.Background(), req, nil)
			if (err != nil) != (tc.wantErr != "") || (err != nil && !strings.Contains(err.Error(), tc.wantErr)) {
				t.Fatalf("got error %v, want %q", err, tc.wantErr)
			}
			if out.Updated || out.Available != tc.version || (opened != "") != tc.opened {
				t.Fatal(out, opened, err)
			}
			if tc.opened {
				data, readErr := os.ReadFile(opened)
				if readErr != nil || string(data) != payload || filepath.Base(opened) != "vip-next-darwin-arm64.pkg" || !strings.Contains(out.Instructions+fmt.Sprint(err), opened) {
					t.Fatal("verified package or recovery path lost", opened, readErr)
				}
			}
			if tc.name == "noninteractive" && !strings.Contains(out.Instructions, "https://github.com"+download) {
				t.Fatal("missing exact download link", out)
			}
			if tc.name == "preferences" {
				if len(out.Warnings) != 1 || !strings.Contains(out.Warnings[0], "could not save update channel") {
					t.Fatal("missing channel warning", out)
				}
			} else {
				want := req.Channel
				if tc.wantErr != "" {
					want = ""
				}
				if got, err := s.State.ReadChannel(); err != nil || got != want {
					t.Fatal("incorrect saved channel", got, err)
				}
			}
			for path, want := range original {
				if got, err := os.ReadFile(path); err != nil || string(got) != want {
					t.Fatal("installation changed", path, err)
				}
			}
		})
	}
}

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

// Keep ownership, release selection, and filesystem effects real. Only release
// discovery and the native GUI boundary are substituted in these tests.
func nativeServiceFixture(t *testing.T, p Platform) (Service, Release) {
	t.Helper()
	dir := t.TempDir()
	cli, helper := p.names()
	for _, name := range []string{cli, helper} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("installed binary"), 0755); err != nil {
			t.Fatal(err)
		}
	}
	manager := "pkg"
	if p.OS == "windows" {
		manager = "msi"
	}
	if err := os.WriteFile(filepath.Join(dir, ".vip-next-installer.json"), []byte(`{"schema":1,"manager":"`+manager+`"}`), 0644); err != nil {
		t.Fatal(err)
	}
	base := "vip-next-" + p.OS + "-" + p.Arch
	r := Release{Tag: "5.0.1"}
	for _, suffix := range []string{".tar.gz", ".tar.gz.sha256", "." + manager, "." + manager + ".sha256"} {
		name := base + suffix
		r.Assets = append(r.Assets, Asset{Name: name, URL: "https://github.com/Automattic/vip-cli/releases/download/5.0.1/" + name})
	}
	s := Service{Installed: "5.0.0", Platform: p, State: State{CacheDir: t.TempDir(), ConfigDir: t.TempDir()}, Executable: func() (string, error) { return filepath.Join(dir, cli), nil }, Fetch: func(context.Context) ([]Release, error) { return []Release{r}, nil }}
	s.Installer.InspectOwnership = func(ctx context.Context, l Layout) (Ownership, error) {
		return inspectOwnership(ctx, l, p.OS, func(context.Context, string, ...string) ([]byte, error) {
			t.Fatal("unexpected package query")
			return nil, nil
		})
	}
	s.Stage = func(context.Context, Candidate, Platform, string) (Bundle, error) {
		t.Fatal("installer-managed installation reached portable replacement")
		return Bundle{}, nil
	}
	return s, r
}

func TestNativeInstallerNonInteractiveLink(t *testing.T) {
	for _, p := range []Platform{{"darwin", "arm64"}, {"darwin", "amd64"}, {"windows", "amd64"}} {
		t.Run(p.OS+"/"+p.Arch, func(t *testing.T) {
			s, r := nativeServiceFixture(t, p)
			s.NativeInstaller.Open = func(context.Context, string) error { t.Fatal("non-interactive launch"); return nil }
			s.NativeInstaller.Downloader.Client = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { t.Fatal("non-interactive download"); return nil, nil })}
			out, err := s.Run(context.Background(), Request{Channel: Preview, ExplicitChannel: true}, nil)
			if err != nil || out.Updated || out.Installed != "5.0.0" || out.Available != "5.0.1" || !strings.Contains(out.Instructions, r.Assets[2].URL) {
				t.Fatalf("missing exact installer link or versions: %+v, %v", out, err)
			}
			ch, err := s.State.ReadChannel()
			if err != nil || ch != Preview {
				t.Fatalf("successful handoff did not save channel: %s, %v", ch, err)
			}
			entries, err := os.ReadDir(s.State.CacheDir)
			if err != nil || len(entries) != 1 || entries[0].IsDir() {
				t.Fatalf("non-interactive update downloaded a package: %v, %v", entries, err)
			}
		})
	}
}

func TestNativeInstallerVerifiedHandoff(t *testing.T) {
	for _, tc := range []struct {
		name     string
		platform Platform
		failure  string
	}{
		{"macOS arm64", Platform{"darwin", "arm64"}, ""},
		{"macOS amd64", Platform{"darwin", "amd64"}, ""},
		{"Windows", Platform{"windows", "amd64"}, ""},
		{"corrupt download", Platform{"darwin", "arm64"}, "checksum"},
		{"wrong GitHub digest", Platform{"darwin", "arm64"}, "digest"},
		{"launcher failure", Platform{"darwin", "arm64"}, "launch"},
		{"channel save failure", Platform{"darwin", "arm64"}, "preferences"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, release := nativeServiceFixture(t, tc.platform)
			if tc.failure == "preferences" {
				s.State.ConfigDir = filepath.Join(t.TempDir(), "not-a-directory")
				if err := os.WriteFile(s.State.ConfigDir, []byte("occupied"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			payload := []byte("native installer payload")
			digest := fmt.Sprintf("%x", sha256.Sum256(payload))
			if tc.failure == "digest" {
				digest = strings.Repeat("0", 64)
			}
			release.Assets[2].Digest = "sha256:" + digest
			release.Assets[2].Size = int64(len(payload))
			s.Fetch = func(context.Context) ([]Release, error) { return []Release{release}, nil }
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "" {
					t.Error("release download sent credentials")
				}
				switch r.URL.Path {
				case "/Automattic/vip-cli/releases/download/5.0.1/" + release.Assets[2].Name:
					w.Write(payload)
				case "/Automattic/vip-cli/releases/download/5.0.1/" + release.Assets[3].Name:
					sum := fmt.Sprintf("%x", sha256.Sum256(payload))
					if tc.failure == "checksum" {
						sum = strings.Repeat("0", 64)
					}
					fmt.Fprintf(w, "%s *%s", sum, release.Assets[2].Name)
				default:
					t.Errorf("unexpected download: %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			client := server.Client()
			transport := client.Transport
			local, _ := url.Parse(server.URL)
			client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
				copy := r.Clone(r.Context())
				copy.URL.Scheme, copy.URL.Host = local.Scheme, local.Host
				return transport.RoundTrip(copy)
			})
			s.NativeInstaller.Downloader = Downloader{Client: client}
			opened := ""
			s.NativeInstaller.Open = func(_ context.Context, path string) error {
				got, err := os.ReadFile(path)
				if err != nil || string(got) != string(payload) || filepath.Base(path) != release.Assets[2].Name {
					t.Fatalf("launcher received incorrect file: %s, %q, %v", path, got, err)
				}
				opened = path
				if tc.failure == "launch" {
					return errors.New("desktop unavailable")
				}
				return nil
			}
			out, err := s.Run(context.Background(), Request{Interactive: true, Channel: Preview, ExplicitChannel: true}, nil)
			if tc.failure != "" && tc.failure != "preferences" {
				if err == nil {
					t.Fatal("expected failure", out)
				}
				if tc.failure == "launch" {
					if opened == "" || !strings.Contains(err.Error(), opened) || !strings.Contains(err.Error(), "desktop unavailable") {
						t.Fatal("missing manual recovery path", opened, err)
					}
				} else if opened != "" {
					t.Fatal("corrupt installer launched", opened)
				}
				ch, _ := s.State.ReadChannel()
				if ch != "" {
					t.Fatal("failed operation saved channel", ch)
				}
			} else {
				if err != nil || out.Updated || opened == "" || !strings.Contains(out.Instructions, "Installer opened") || !strings.Contains(out.Instructions, opened) {
					t.Fatal(out, opened, err)
				}
				if tc.failure == "preferences" {
					if len(out.Warnings) != 1 || !strings.Contains(out.Warnings[0], "could not save update channel") {
						t.Fatal("missing channel warning", out)
					}
				} else {
					ch, err := s.State.ReadChannel()
					if err != nil || ch != Preview {
						t.Fatal("channel not saved", ch, err)
					}
				}
			}
			if opened != "" {
				if _, err := os.Stat(opened); err != nil {
					t.Fatal("installer removed before GUI could read it", err)
				}
			} else {
				entries, _ := os.ReadDir(s.State.CacheDir)
				for _, entry := range entries {
					if entry.IsDir() {
						t.Fatal("failed download leaked directory", entry.Name())
					}
				}
			}
			exe, _ := s.Executable()
			entries, _ := os.ReadDir(filepath.Dir(exe))
			if len(entries) != 3 {
				t.Fatal("installation directory modified", entries)
			}
			cli, helper := tc.platform.names()
			for _, name := range []string{cli, helper} {
				got, err := os.ReadFile(filepath.Join(filepath.Dir(exe), name))
				if err != nil || string(got) != "installed binary" {
					t.Fatal("installed bytes replaced", name, err)
				}
			}
			marker, err := os.ReadFile(filepath.Join(filepath.Dir(exe), ".vip-next-installer.json"))
			if err != nil || !strings.Contains(string(marker), `"schema":1`) {
				t.Fatal("ownership marker changed", err)
			}
		})
	}
}

func TestNativeInstallerRejectsUnavailableOrUntrustedAssets(t *testing.T) {
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
		{"wrong release checksum", func(r *Release) { r.Assets[3].URL = strings.Replace(r.Assets[3].URL, "5.0.1", "5.0.0", 1) }, "official release asset URL"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, r := nativeServiceFixture(t, Platform{"darwin", "arm64"})
			tc.change(&r)
			s.Fetch = func(context.Context) ([]Release, error) { return []Release{r}, nil }
			s.NativeInstaller.Open = func(context.Context, string) error { t.Fatal("invalid installer launched"); return nil }
			s.NativeInstaller.Downloader.Client = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { t.Fatal("invalid assets downloaded"); return nil, nil })}
			for _, interactive := range []bool{false, true} {
				out, err := s.Run(context.Background(), Request{Interactive: interactive}, nil)
				if err == nil || !strings.Contains(err.Error(), tc.want) || out.Updated {
					t.Fatal(out, err)
				}
			}
		})
	}
}

func TestNativeInstallerUsesSelectedRelease(t *testing.T) {
	s, stable := nativeServiceFixture(t, Platform{"darwin", "arm64"})
	preview := Release{Tag: "5.1.0-beta.1", Prerelease: true}
	for _, a := range stable.Assets {
		a.URL = strings.Replace(a.URL, "5.0.1", "5.1.0-beta.1", 1)
		preview.Assets = append(preview.Assets, a)
	}
	s.Fetch = func(context.Context) ([]Release, error) { return []Release{stable, preview}, nil }
	for _, tc := range []struct {
		channel Channel
		version string
	}{{Stable, "5.0.1"}, {Preview, "5.1.0-beta.1"}} {
		out, err := s.Run(context.Background(), Request{Channel: tc.channel, ExplicitChannel: true}, nil)
		if err != nil || out.Available != tc.version || !strings.Contains(out.Instructions, "/download/"+tc.version+"/vip-next-darwin-arm64.pkg") {
			t.Fatal("wrong channel or installer release", out, err)
		}
	}
	preview.Assets = preview.Assets[:2]
	if _, err := s.Run(context.Background(), Request{Channel: Preview, ExplicitChannel: true}, nil); err == nil || !strings.Contains(err.Error(), "5.1.0-beta.1 has no complete") {
		t.Fatal("missing preview installer silently fell back to stable", err)
	}
	s.NativeInstaller.Open = func(context.Context, string) error { t.Fatal("check opened installer"); return nil }
	s.NativeInstaller.Downloader.Client = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { t.Fatal("check downloaded installer"); return nil, nil })}
	out, err := s.Run(context.Background(), Request{CheckOnly: true, Interactive: true, Channel: Preview, ExplicitChannel: true}, nil)
	if err != nil || out.Available != "5.1.0-beta.1" || out.Updated || out.Instructions != "" {
		t.Fatal("check must remain informational", out, err)
	}
}

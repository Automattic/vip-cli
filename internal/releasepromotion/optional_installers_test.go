package releasepromotion

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

func TestDownloadVerifyAndReplaceWithOptionalInstallers(t *testing.T) {
	for _, windowsInstaller := range []bool{false, true} {
		name := "binaries-only"
		if windowsInstaller {
			name = "binaries-and-windows-installer"
		}
		t.Run(name, func(t *testing.T) {
			fixtures := t.TempDir()
			writeCompleteArtifactSet(t, fixtures)
			var expected, uploaded []string
			var artifacts []Artifact
			var serverURL string
			deleted := false
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case strings.HasSuffix(r.URL.Path, "/artifacts"):
					writeJSON(t, w, artifacts)
				case strings.HasPrefix(r.URL.Path, "/download/"):
					data, err := os.ReadFile(filepath.Join(fixtures, filepath.Base(r.URL.Path)))
					if err != nil {
						t.Error(err)
						w.WriteHeader(404)
						return
					}
					_, _ = w.Write(data)
				case r.Method == http.MethodDelete:
					deleted = true
					w.WriteHeader(http.StatusNoContent)
				case r.Method == http.MethodPost && r.URL.Path == "/uploads":
					name := r.URL.Query().Get("name")
					data, _ := io.ReadAll(r.Body)
					original, err := os.ReadFile(filepath.Join(fixtures, name))
					if err != nil || string(data) != string(original) {
						t.Errorf("uploaded wrong bytes for %s: %v", name, err)
					}
					uploaded = append(uploaded, name)
					w.WriteHeader(http.StatusCreated)
				default:
					t.Errorf("unexpected request %s %s", r.Method, r.URL)
					w.WriteHeader(500)
				}
			}))
			defer server.Close()
			serverURL = server.URL
			for _, p := range ExpectedArtifactPaths() {
				if !strings.Contains(p, ".tar.gz") && !(windowsInstaller && strings.Contains(p, ".msi")) {
					continue
				}
				expected = append(expected, filepath.Base(p))
				artifacts = append(artifacts, Artifact{Path: p, State: "finished", DownloadURL: serverURL + "/download/" + filepath.Base(p)})
			}
			downloads := t.TempDir()
			if err := testBuildkiteClient(server.URL).DownloadArtifacts(context.Background(), Build{Number: 28}, downloads); err != nil {
				t.Fatal(err)
			}
			if err := VerifyDownloads(downloads); err != nil {
				t.Fatal(err)
			}
			// A retry also removes an old optional installer from the draft when the
			// current exact build did not produce it.
			release := Release{ID: 1, Draft: true, UploadURL: server.URL + "/uploads{?name,label}", Assets: []ReleaseAsset{{ID: 9, Name: "vip-next-darwin-amd64.pkg"}}}
			if err := testGitHubClient(server.URL).ReplaceAssets(context.Background(), release, downloads); err != nil {
				t.Fatal(err)
			}
			sort.Strings(expected)
			sort.Strings(uploaded)
			if !deleted || !reflect.DeepEqual(expected, uploaded) {
				t.Fatalf("deleted=%t uploaded=%v want=%v", deleted, uploaded, expected)
			}
		})
	}
}

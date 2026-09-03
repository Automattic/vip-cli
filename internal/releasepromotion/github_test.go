package releasepromotion

import (
	"context"
	json "encoding/json/v2"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestEnsureDraftCreatesReleaseAndTagAtCommit(t *testing.T) {
	t.Parallel()
	const version = "5.0.0-beta.1"
	const commit = "0123456789abcdef0123456789abcdef01234567"
	var mutations []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assertGitHubRequest(t, r)
		switch {
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/releases/tags/"):
			http.NotFound(w, r)
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/ref/tags/"):
			http.NotFound(w, r)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/releases"):
			mutations = append(mutations, "create")
			var body map[string]any
			decodeJSONBody(t, r, &body)
			if body["tag_name"] != version || body["target_commitish"] != commit || body["draft"] != true || body["prerelease"] != true {
				t.Fatalf("create body = %#v", body)
			}
			w.WriteHeader(http.StatusCreated)
			writeJSON(t, w, Release{ID: 12, TagName: version, Draft: true, Prerelease: true, UploadURL: serverURL(r) + "/uploads/12{?name,label}"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	release, err := testGitHubClient(server.URL).EnsureDraft(context.Background(), version, commit)
	if err != nil {
		t.Fatal(err)
	}
	if release.ID != 12 || len(mutations) != 1 {
		t.Fatalf("release = %#v, mutations = %v", release, mutations)
	}
}

func TestEnsureDraftResumesSameCommitDraft(t *testing.T) {
	t.Parallel()
	const commit = "0123456789abcdef0123456789abcdef01234567"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/releases/tags/"):
			writeJSON(t, w, Release{ID: 44, TagName: "5.0.0-rc.1", Draft: true, Prerelease: true})
		case strings.Contains(r.URL.Path, "/commits/"):
			writeJSON(t, w, map[string]string{"sha": commit})
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()
	release, err := testGitHubClient(server.URL).EnsureDraft(context.Background(), "5.0.0-rc.1", commit)
	if err != nil {
		t.Fatal(err)
	}
	if release.ID != 44 {
		t.Fatalf("release ID = %d", release.ID)
	}
}

func TestEnsureDraftRejectsTagAtDifferentCommit(t *testing.T) {
	t.Parallel()
	var mutations int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			mutations++
		}
		if strings.Contains(r.URL.Path, "/releases/tags/") {
			writeJSON(t, w, Release{ID: 44, TagName: "5.0.0-rc.1", Draft: true, Prerelease: true})
			return
		}
		writeJSON(t, w, map[string]string{"sha": strings.Repeat("a", 40)})
	}))
	defer server.Close()
	_, err := testGitHubClient(server.URL).EnsureDraft(context.Background(), "5.0.0-rc.1", strings.Repeat("b", 40))
	if err == nil || !strings.Contains(err.Error(), "different commit") || mutations != 0 {
		t.Fatalf("error = %v, mutations = %d", err, mutations)
	}
}

func TestEnsureDraftRejectsPublishedRelease(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, Release{ID: 44, TagName: "5.0.0-rc.1", Draft: false, Prerelease: true})
	}))
	defer server.Close()
	_, err := testGitHubClient(server.URL).EnsureDraft(context.Background(), "5.0.0-rc.1", strings.Repeat("b", 40))
	if err == nil || !strings.Contains(err.Error(), "published") {
		t.Fatalf("error = %v", err)
	}
}

func TestEnsureDraftRejectsExistingTagWithoutRelease(t *testing.T) {
	t.Parallel()
	var mutations int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			mutations++
		}
		if strings.Contains(r.URL.Path, "/releases/tags/") {
			http.NotFound(w, r)
			return
		}
		writeJSON(t, w, map[string]any{"ref": "refs/tags/5.0.0-beta.1"})
	}))
	defer server.Close()
	_, err := testGitHubClient(server.URL).EnsureDraft(context.Background(), "5.0.0-beta.1", strings.Repeat("b", 40))
	if err == nil || !strings.Contains(err.Error(), "without a release") || mutations != 0 {
		t.Fatalf("error = %v, mutations = %d", err, mutations)
	}
}

func TestReplaceAssetsRejectsUnexpectedExistingAsset(t *testing.T) {
	t.Parallel()
	var requests int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests++
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	release := Release{ID: 1, Draft: true, Assets: []ReleaseAsset{{ID: 9, Name: "notes.txt"}}, UploadURL: server.URL + "/uploads{?name,label}"}
	err := testGitHubClient(server.URL).ReplaceAssets(context.Background(), release, t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "unexpected existing asset") || requests != 0 {
		t.Fatalf("error = %v, requests = %d", err, requests)
	}
}

func TestReplaceAssetsDeletesKnownAssetsAndUploadsVerifiedFiles(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for _, artifactPath := range ExpectedArtifactPaths() {
		if err := os.WriteFile(filepath.Join(root, filepath.Base(artifactPath)), []byte(artifactPath), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	var mu sync.Mutex
	var deleted, uploaded []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		switch r.Method {
		case http.MethodDelete:
			deleted = append(deleted, filepath.Base(r.URL.Path))
			w.WriteHeader(http.StatusNoContent)
		case http.MethodPost:
			uploaded = append(uploaded, r.URL.Query().Get("name"))
			w.WriteHeader(http.StatusCreated)
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	}))
	defer server.Close()
	release := Release{
		ID:        1,
		Draft:     true,
		Assets:    []ReleaseAsset{{ID: 9, Name: "vip-next-darwin-amd64.tar.gz"}},
		UploadURL: server.URL + "/uploads{?name,label}",
	}
	if err := testGitHubClient(server.URL).ReplaceAssets(context.Background(), release, root); err != nil {
		t.Fatal(err)
	}
	if len(deleted) != 1 || len(uploaded) != len(ExpectedArtifactPaths()) {
		t.Fatalf("deleted = %v, uploaded = %v", deleted, uploaded)
	}
}

func TestPublishPrereleaseIsLastMutation(t *testing.T) {
	t.Parallel()
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch || !strings.HasSuffix(r.URL.Path, "/releases/88") {
			t.Fatalf("request = %s %s", r.Method, r.URL.Path)
		}
		decodeJSONBody(t, r, &body)
		writeJSON(t, w, Release{ID: 88, Draft: false, Prerelease: true})
	}))
	defer server.Close()
	if err := testGitHubClient(server.URL).PublishPrerelease(context.Background(), Release{ID: 88, Draft: true}); err != nil {
		t.Fatal(err)
	}
	if body["draft"] != false || body["prerelease"] != true {
		t.Fatalf("body = %#v", body)
	}
}

func testGitHubClient(baseURL string) *GitHubClient {
	return &GitHubClient{BaseURL: baseURL, UploadsURL: baseURL, Token: "github-token", HTTPClient: http.DefaultClient}
}

func assertGitHubRequest(t *testing.T, r *http.Request) {
	t.Helper()
	if got := r.Header.Get("Authorization"); got != "Bearer github-token" {
		t.Errorf("Authorization = %q", got)
	}
}

func decodeJSONBody(t *testing.T, r *http.Request, target any) {
	t.Helper()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(body, target); err != nil {
		t.Fatal(err)
	}
}

func serverURL(r *http.Request) string {
	return (&url.URL{Scheme: "http", Host: r.Host}).String()
}

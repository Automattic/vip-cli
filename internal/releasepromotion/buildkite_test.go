package releasepromotion

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestWaitForTaggedBuildSelectsExactTagAndCommit(t *testing.T) {
	t.Parallel()
	const tag = "5.0.0-beta.1"
	const commit = "0123456789abcdef0123456789abcdef01234567"
	server := newBuildkiteServer(t, func(w http.ResponseWriter, r *http.Request) {
		assertBuildkiteRequest(t, r)
		if got := r.URL.Query().Get("branch"); got != tag {
			t.Errorf("branch query = %q, want %q", got, tag)
		}
		writeJSON(t, w, []Build{
			{Number: 1, Branch: "trunk", Commit: commit, State: "passed", CreatedAt: time.Unix(1, 0)},
			{Number: 2, Branch: tag, Commit: strings.Repeat("a", 40), State: "passed", CreatedAt: time.Unix(2, 0)},
			{Number: 3, Branch: tag, Commit: commit, State: "passed", CreatedAt: time.Unix(3, 0)},
		})
	})
	defer server.Close()

	client := testBuildkiteClient(server.URL)
	build, err := client.WaitForTaggedBuild(context.Background(), tag, commit)
	if err != nil {
		t.Fatal(err)
	}
	if build.Number != 3 {
		t.Fatalf("build number = %d, want 3", build.Number)
	}
}

func TestWaitForTaggedBuildIgnoresStaleCommitBuild(t *testing.T) {
	t.Parallel()
	const tag = "5.0.0-beta.1"
	const commit = "0123456789abcdef0123456789abcdef01234567"
	var requests atomic.Int32
	server := newBuildkiteServer(t, func(w http.ResponseWriter, _ *http.Request) {
		if requests.Add(1) == 1 {
			writeJSON(t, w, []Build{{Number: 1, Branch: tag, Commit: strings.Repeat("a", 40), State: "passed"}})
			return
		}
		writeJSON(t, w, []Build{{Number: 2, Branch: tag, Commit: commit, State: "passed"}})
	})
	defer server.Close()
	client := testBuildkiteClient(server.URL)
	client.Sleep = func(context.Context, time.Duration) error { return nil }

	build, err := client.WaitForTaggedBuild(context.Background(), tag, commit)
	if err != nil {
		t.Fatal(err)
	}
	if build.Number != 2 || requests.Load() != 2 {
		t.Fatalf("build = %#v, requests = %d", build, requests.Load())
	}
}

func TestWaitForTaggedBuildWaitsThroughScheduledAndRunning(t *testing.T) {
	t.Parallel()
	states := []string{"scheduled", "running", "passed"}
	var requests atomic.Int32
	server := newBuildkiteServer(t, func(w http.ResponseWriter, _ *http.Request) {
		index := int(requests.Add(1)) - 1
		writeJSON(t, w, []Build{{Number: 7, Branch: "5.0.0-rc.1", Commit: strings.Repeat("b", 40), State: states[index]}})
	})
	defer server.Close()
	client := testBuildkiteClient(server.URL)
	client.Sleep = func(context.Context, time.Duration) error { return nil }

	build, err := client.WaitForTaggedBuild(context.Background(), "5.0.0-rc.1", strings.Repeat("b", 40))
	if err != nil {
		t.Fatal(err)
	}
	if build.State != "passed" || requests.Load() != 3 {
		t.Fatalf("build state = %q, requests = %d", build.State, requests.Load())
	}
}

func TestWaitForTaggedBuildReturnsFailedAndCanceledStates(t *testing.T) {
	t.Parallel()
	for _, state := range []string{"failed", "canceled"} {
		state := state
		t.Run(state, func(t *testing.T) {
			t.Parallel()
			server := newBuildkiteServer(t, func(w http.ResponseWriter, _ *http.Request) {
				writeJSON(t, w, []Build{{Number: 9, Branch: "5.0.0-beta.2", Commit: strings.Repeat("c", 40), State: state, WebURL: "https://buildkite.example/build/9"}})
			})
			defer server.Close()
			client := testBuildkiteClient(server.URL)
			_, err := client.WaitForTaggedBuild(context.Background(), "5.0.0-beta.2", strings.Repeat("c", 40))
			if err == nil || !strings.Contains(err.Error(), state) || !strings.Contains(err.Error(), "https://buildkite.example/build/9") {
				t.Fatalf("error = %v", err)
			}
		})
	}
}

func TestGetBuild(t *testing.T) {
	t.Parallel()
	server := newBuildkiteServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/builds/28") {
			t.Fatalf("path = %q", r.URL.Path)
		}
		writeJSON(t, w, Build{Number: 28, Branch: "trunk", Commit: strings.Repeat("d", 40), State: "passed"})
	})
	defer server.Close()
	build, err := testBuildkiteClient(server.URL).GetBuild(context.Background(), 28)
	if err != nil {
		t.Fatal(err)
	}
	if build.Number != 28 {
		t.Fatalf("build number = %d", build.Number)
	}
}

func TestDownloadArtifactsRequiresExactManifest(t *testing.T) {
	t.Parallel()
	artifacts := completeArtifactManifest("http://unused.invalid")
	artifacts = artifacts[1:]
	server := newBuildkiteServer(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/artifacts") {
			writeJSON(t, w, artifacts)
			return
		}
		http.NotFound(w, r)
	})
	defer server.Close()
	err := testBuildkiteClient(server.URL).DownloadArtifacts(context.Background(), Build{Number: 28}, t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "missing artifacts") {
		t.Fatalf("error = %v", err)
	}
}

func TestDownloadArtifacts(t *testing.T) {
	t.Parallel()
	var serverURL string
	server := newBuildkiteServer(t, func(w http.ResponseWriter, r *http.Request) {
		assertBuildkiteRequest(t, r)
		if strings.HasSuffix(r.URL.Path, "/artifacts") {
			writeJSON(t, w, completeArtifactManifest(serverURL))
			return
		}
		if strings.HasPrefix(r.URL.Path, "/download/") {
			_, _ = w.Write([]byte(filepath.Base(r.URL.Path)))
			return
		}
		http.NotFound(w, r)
	})
	serverURL = server.URL
	defer server.Close()

	root := t.TempDir()
	err := testBuildkiteClient(server.URL).DownloadArtifacts(context.Background(), Build{Number: 28}, root)
	if err != nil {
		t.Fatal(err)
	}
	for _, artifactPath := range ExpectedArtifactPaths() {
		name := filepath.Base(artifactPath)
		contents, err := os.ReadFile(filepath.Join(root, name))
		if err != nil {
			t.Fatal(err)
		}
		if string(contents) != name {
			t.Errorf("%s contents = %q", name, contents)
		}
	}
}

func TestDownloadArtifactsRejectsNonSuccessHTTPStatus(t *testing.T) {
	t.Parallel()
	var serverURL string
	server := newBuildkiteServer(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/artifacts") {
			writeJSON(t, w, completeArtifactManifest(serverURL))
			return
		}
		http.Error(w, "nope", http.StatusBadGateway)
	})
	serverURL = server.URL
	defer server.Close()
	root := t.TempDir()
	err := testBuildkiteClient(server.URL).DownloadArtifacts(context.Background(), Build{Number: 28}, root)
	if err == nil || !strings.Contains(err.Error(), "502") {
		t.Fatalf("error = %v", err)
	}
	matches, err := filepath.Glob(filepath.Join(root, "*.partial"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 0 {
		t.Fatalf("partial files left behind: %v", matches)
	}
}

func newBuildkiteServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	return httptest.NewServer(handler)
}

func testBuildkiteClient(baseURL string) *BuildkiteClient {
	return &BuildkiteClient{BaseURL: baseURL, Token: "test-token", HTTPClient: http.DefaultClient, PollInterval: time.Millisecond}
}

func assertBuildkiteRequest(t *testing.T, r *http.Request) {
	t.Helper()
	if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
		t.Errorf("Authorization = %q", got)
	}
}

func completeArtifactManifest(baseURL string) []Artifact {
	paths := ExpectedArtifactPaths()
	artifacts := make([]Artifact, 0, len(paths))
	for i, artifactPath := range paths {
		artifacts = append(artifacts, Artifact{
			ID:          fmt.Sprintf("artifact-%d", i),
			Path:        artifactPath,
			Filename:    filepath.Base(artifactPath),
			State:       "finished",
			DownloadURL: baseURL + "/download/" + filepath.Base(artifactPath),
		})
	}
	return artifacts
}

func writeJSON(t *testing.T, w http.ResponseWriter, value any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write(data); err != nil {
		t.Fatal(err)
	}
}

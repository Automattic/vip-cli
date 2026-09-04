package releasepromotion

import (
	"bytes"
	"context"
	json "encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/httpproxy"
)

const (
	defaultGitHubBaseURL    = "https://api.github.com"
	defaultGitHubUploadsURL = "https://uploads.github.com"
)

type ReleaseAsset struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type Release struct {
	ID         int64          `json:"id"`
	TagName    string         `json:"tag_name"`
	Draft      bool           `json:"draft"`
	Prerelease bool           `json:"prerelease"`
	UploadURL  string         `json:"upload_url"`
	Assets     []ReleaseAsset `json:"assets"`
}

type gitReference struct {
	Ref    string `json:"ref"`
	Object struct {
		Type string `json:"type"`
		SHA  string `json:"sha"`
	} `json:"object"`
}

type GitHubClient struct {
	BaseURL    string
	UploadsURL string
	Token      string
	HTTPClient *http.Client
}

func (c *GitHubClient) EnsureDraft(ctx context.Context, version, commit string) (Release, error) {
	releaseEndpoint := fmt.Sprintf("%s/repos/%s/releases/tags/%s", c.baseURL(), GitHubRepository, url.PathEscape(version))
	var release Release
	status, err := c.getJSON(ctx, releaseEndpoint, &release)
	if err != nil {
		return Release{}, err
	}
	if status == http.StatusOK {
		if !release.Draft {
			return Release{}, fmt.Errorf("release %q is already published and is immutable", version)
		}
		if release.TagName != version {
			return Release{}, fmt.Errorf("release tag %q does not match requested version %q", release.TagName, version)
		}
		if err := c.verifyTag(ctx, version, commit, false); err != nil {
			return Release{}, err
		}
		return release, nil
	}
	if status != http.StatusNotFound {
		return Release{}, fmt.Errorf("look up release %q: HTTP %d", version, status)
	}
	existingDraft, err := c.findDraft(ctx, version)
	if err != nil {
		return Release{}, err
	}
	if existingDraft != nil {
		if err := c.verifyTag(ctx, version, commit, false); err != nil {
			return Release{}, err
		}
		return *existingDraft, nil
	}

	if err := c.ensureTag(ctx, version, commit); err != nil {
		return Release{}, err
	}

	body := map[string]any{
		"tag_name":               version,
		"target_commitish":       commit,
		"name":                   version,
		"draft":                  true,
		"prerelease":             true,
		"generate_release_notes": true,
		"make_latest":            "false",
	}
	createEndpoint := fmt.Sprintf("%s/repos/%s/releases", c.baseURL(), GitHubRepository)
	if err := c.sendJSON(ctx, http.MethodPost, createEndpoint, body, http.StatusCreated, &release); err != nil {
		return Release{}, err
	}
	return release, nil
}

func (c *GitHubClient) findDraft(ctx context.Context, version string) (*Release, error) {
	endpoint := fmt.Sprintf("%s/repos/%s/releases?per_page=100", c.baseURL(), GitHubRepository)
	var releases []Release
	status, err := c.getJSON(ctx, endpoint, &releases)
	if err != nil {
		return nil, fmt.Errorf("list releases: %w", err)
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("list releases: HTTP %d", status)
	}
	for i := range releases {
		if releases[i].Draft && releases[i].TagName == version {
			return &releases[i], nil
		}
	}
	return nil, nil
}

func (c *GitHubClient) ensureTag(ctx context.Context, version, commit string) error {
	return c.verifyTag(ctx, version, commit, true)
}

func (c *GitHubClient) verifyTag(ctx context.Context, version, commit string, createIfMissing bool) error {
	refEndpoint := fmt.Sprintf("%s/repos/%s/git/ref/tags/%s", c.baseURL(), GitHubRepository, url.PathEscape(version))
	var ref gitReference
	status, err := c.getJSON(ctx, refEndpoint, &ref)
	if err != nil {
		return err
	}
	if status == http.StatusNotFound {
		if !createIfMissing {
			return fmt.Errorf("draft release %q has no tag", version)
		}
		createEndpoint := fmt.Sprintf("%s/repos/%s/git/refs", c.baseURL(), GitHubRepository)
		body := map[string]any{"ref": "refs/tags/" + version, "sha": commit}
		if err := c.sendJSON(ctx, http.MethodPost, createEndpoint, body, http.StatusCreated, nil); err != nil {
			return fmt.Errorf("create tag %q: %w", version, err)
		}
		return nil
	}
	if status != http.StatusOK {
		return fmt.Errorf("look up tag %q: HTTP %d", version, status)
	}
	expectedRef := "refs/tags/" + version
	if ref.Ref != expectedRef {
		return fmt.Errorf("tag reference %q does not match expected %q", ref.Ref, expectedRef)
	}
	if ref.Object.Type != "commit" {
		return fmt.Errorf("tag %q must be a lightweight tag pointing directly to a commit; object type is %q", version, ref.Object.Type)
	}
	if ref.Object.SHA != commit {
		return fmt.Errorf("tag %q points to a different commit %q; expected %q", version, ref.Object.SHA, commit)
	}
	return nil
}

func (c *GitHubClient) ReplaceAssets(ctx context.Context, release Release, root string) error {
	if !release.Draft {
		return fmt.Errorf("release %d is already published; refusing to replace assets", release.ID)
	}
	expectedNames := make(map[string]struct{}, len(expectedArtifactPaths))
	for _, artifactPath := range expectedArtifactPaths {
		expectedNames[filepath.Base(artifactPath)] = struct{}{}
	}
	for _, asset := range release.Assets {
		if _, ok := expectedNames[asset.Name]; !ok {
			return fmt.Errorf("unexpected existing asset %q on draft release", asset.Name)
		}
	}
	for name := range expectedNames {
		info, err := os.Stat(filepath.Join(root, name))
		if err != nil {
			return fmt.Errorf("read replacement asset %q: %w", name, err)
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("replacement asset %q is not a regular file", name)
		}
	}

	for _, asset := range release.Assets {
		endpoint := fmt.Sprintf("%s/repos/%s/releases/assets/%d", c.baseURL(), GitHubRepository, asset.ID)
		if err := c.sendNoContent(ctx, http.MethodDelete, endpoint); err != nil {
			return fmt.Errorf("delete existing asset %q: %w", asset.Name, err)
		}
	}

	uploadBase := strings.TrimSuffix(release.UploadURL, "{?name,label}")
	if uploadBase == "" {
		uploadBase = fmt.Sprintf("%s/repos/%s/releases/%d/assets", c.uploadsURL(), GitHubRepository, release.ID)
	}
	for _, artifactPath := range expectedArtifactPaths {
		name := filepath.Base(artifactPath)
		if err := c.uploadAsset(ctx, uploadBase, name, filepath.Join(root, name)); err != nil {
			return err
		}
	}
	return nil
}

func (c *GitHubClient) PublishPrerelease(ctx context.Context, release Release) error {
	if !release.Draft {
		return fmt.Errorf("release %d is already published", release.ID)
	}
	endpoint := fmt.Sprintf("%s/repos/%s/releases/%d", c.baseURL(), GitHubRepository, release.ID)
	body := map[string]any{"draft": false, "prerelease": true, "make_latest": "false"}
	if err := c.sendJSON(ctx, http.MethodPatch, endpoint, body, http.StatusOK, nil); err != nil {
		if release.TagName != "" {
			current, reconciled := c.reconcilePublished(ctx, release)
			if reconciled {
				return nil
			}
			if current != nil {
				return fmt.Errorf("publish release %q: %w; reconciliation failed: %v", release.TagName, err, current)
			}
		}
		return fmt.Errorf("publish release %q: %w", release.TagName, err)
	}
	return nil
}

func (c *GitHubClient) reconcilePublished(ctx context.Context, release Release) (error, bool) {
	endpoint := fmt.Sprintf("%s/repos/%s/releases/tags/%s", c.baseURL(), GitHubRepository, url.PathEscape(release.TagName))
	var current Release
	status, err := c.getJSON(ctx, endpoint, &current)
	if err != nil {
		return err, false
	}
	if status != http.StatusOK {
		return fmt.Errorf("look up release after publish: HTTP %d", status), false
	}
	if current.ID == release.ID && current.TagName == release.TagName && !current.Draft && current.Prerelease {
		return nil, true
	}
	return fmt.Errorf("release state is id=%d tag=%q draft=%t prerelease=%t", current.ID, current.TagName, current.Draft, current.Prerelease), false
}

func (c *GitHubClient) uploadAsset(ctx context.Context, uploadBase, name, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	endpoint, err := url.Parse(uploadBase)
	if err != nil {
		return fmt.Errorf("parse release upload URL: %w", err)
	}
	query := endpoint.Query()
	query.Set("name", name)
	endpoint.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), file)
	if err != nil {
		return err
	}
	request.ContentLength = info.Size()
	c.authorize(request)
	if strings.HasSuffix(name, ".sha256") {
		request.Header.Set("Content-Type", "text/plain")
	} else {
		request.Header.Set("Content-Type", "application/gzip")
	}
	response, err := c.httpClient().Do(request)
	if err != nil {
		return fmt.Errorf("upload asset %q: %w", name, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		return fmt.Errorf("upload asset %q: %w", name, httpStatusError(response))
	}
	return nil
}

func (c *GitHubClient) getJSON(ctx context.Context, endpoint string, target any) (int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, err
	}
	c.authorize(request)
	response, err := c.httpClient().Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return response.StatusCode, nil
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return response.StatusCode, httpStatusError(response)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return response.StatusCode, err
	}
	if err := json.Unmarshal(body, target); err != nil {
		return response.StatusCode, fmt.Errorf("decode GitHub response: %w", err)
	}
	return response.StatusCode, nil
}

func (c *GitHubClient) sendJSON(ctx context.Context, method, endpoint string, value any, wantStatus int, target any) error {
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	c.authorize(request)
	request.Header.Set("Content-Type", "application/json")
	response, err := c.httpClient().Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != wantStatus {
		return httpStatusError(response)
	}
	if target == nil {
		return nil
	}
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}
	if len(responseBody) > 0 && target != nil {
		if err := json.Unmarshal(responseBody, target); err != nil {
			return fmt.Errorf("decode GitHub response: %w", err)
		}
	}
	return nil
}

func (c *GitHubClient) sendNoContent(ctx context.Context, method, endpoint string) error {
	request, err := http.NewRequestWithContext(ctx, method, endpoint, nil)
	if err != nil {
		return err
	}
	c.authorize(request)
	response, err := c.httpClient().Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		return httpStatusError(response)
	}
	return nil
}

func (c *GitHubClient) authorize(request *http.Request) {
	request.Header.Set("Authorization", "Bearer "+c.Token)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
}

func (c *GitHubClient) baseURL() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/")
	}
	return defaultGitHubBaseURL
}

func (c *GitHubClient) uploadsURL() string {
	if c.UploadsURL != "" {
		return strings.TrimRight(c.UploadsURL, "/")
	}
	return defaultGitHubUploadsURL
}

func (c *GitHubClient) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return httpproxy.ClientWithTimeout(30 * time.Second)
}

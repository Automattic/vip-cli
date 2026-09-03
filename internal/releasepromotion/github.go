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
		commitEndpoint := fmt.Sprintf("%s/repos/%s/commits/%s", c.baseURL(), GitHubRepository, url.PathEscape(version))
		var resolved struct {
			SHA string `json:"sha"`
		}
		commitStatus, err := c.getJSON(ctx, commitEndpoint, &resolved)
		if err != nil {
			return Release{}, err
		}
		if commitStatus != http.StatusOK {
			return Release{}, fmt.Errorf("resolve tag %q: HTTP %d", version, commitStatus)
		}
		if resolved.SHA != commit {
			return Release{}, fmt.Errorf("tag %q points to a different commit %q; expected %q", version, resolved.SHA, commit)
		}
		return release, nil
	}
	if status != http.StatusNotFound {
		return Release{}, fmt.Errorf("look up release %q: HTTP %d", version, status)
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

func (c *GitHubClient) ensureTag(ctx context.Context, version, commit string) error {
	refEndpoint := fmt.Sprintf("%s/repos/%s/git/ref/tags/%s", c.baseURL(), GitHubRepository, url.PathEscape(version))
	var ref map[string]any
	status, err := c.getJSON(ctx, refEndpoint, &ref)
	if err != nil {
		return err
	}
	if status == http.StatusNotFound {
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

	commitEndpoint := fmt.Sprintf("%s/repos/%s/commits/%s", c.baseURL(), GitHubRepository, url.PathEscape(version))
	var resolved struct {
		SHA string `json:"sha"`
	}
	commitStatus, err := c.getJSON(ctx, commitEndpoint, &resolved)
	if err != nil {
		return err
	}
	if commitStatus != http.StatusOK {
		return fmt.Errorf("resolve tag %q: HTTP %d", version, commitStatus)
	}
	if resolved.SHA != commit {
		return fmt.Errorf("tag %q points to a different commit %q; expected %q", version, resolved.SHA, commit)
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
	return c.sendJSON(ctx, http.MethodPatch, endpoint, body, http.StatusOK, &Release{})
}

func (c *GitHubClient) uploadAsset(ctx context.Context, uploadBase, name, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()
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
	return &http.Client{Timeout: 30 * time.Second}
}

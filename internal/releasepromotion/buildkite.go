package releasepromotion

import (
	"context"
	json "encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/httpproxy"
)

const defaultBuildkiteBaseURL = "https://api.buildkite.com/v2"

type Build struct {
	Number    int       `json:"number"`
	Branch    string    `json:"branch"`
	Commit    string    `json:"commit"`
	State     string    `json:"state"`
	WebURL    string    `json:"web_url"`
	CreatedAt time.Time `json:"created_at"`
}

type BuildkiteClient struct {
	BaseURL      string
	Token        string
	HTTPClient   *http.Client
	PollInterval time.Duration
	Sleep        func(context.Context, time.Duration) error
}

func (c *BuildkiteClient) WaitForTaggedBuild(ctx context.Context, tag, commit string) (Build, error) {
	for {
		query := url.Values{
			"branch":       {tag},
			"commit":       {commit},
			"exclude_jobs": {"true"},
			"per_page":     {"30"},
		}
		endpoint := fmt.Sprintf("%s/organizations/%s/pipelines/%s/builds?%s", c.baseURL(), BuildkiteOrganization, BuildkitePipeline, query.Encode())
		var builds []Build
		if err := c.getJSON(ctx, endpoint, &builds); err != nil {
			return Build{}, err
		}

		matches := make([]Build, 0, len(builds))
		for _, build := range builds {
			if build.Branch == tag && build.Commit == commit {
				matches = append(matches, build)
			}
		}
		if len(matches) > 0 {
			sort.SliceStable(matches, func(i, j int) bool { return matches[i].CreatedAt.After(matches[j].CreatedAt) })
			build := matches[0]
			switch build.State {
			case "passed":
				return build, nil
			case "creating", "scheduled", "waiting", "running", "failing", "canceling", "blocked":
				// Wait below.
			default:
				return Build{}, fmt.Errorf("Buildkite build %d ended in state %q: %s", build.Number, build.State, build.WebURL)
			}
		}

		if err := c.sleep(ctx, c.pollInterval()); err != nil {
			return Build{}, err
		}
	}
}

func (c *BuildkiteClient) GetBuild(ctx context.Context, number int) (Build, error) {
	endpoint := fmt.Sprintf("%s/organizations/%s/pipelines/%s/builds/%d?exclude_jobs=true", c.baseURL(), BuildkiteOrganization, BuildkitePipeline, number)
	var build Build
	if err := c.getJSON(ctx, endpoint, &build); err != nil {
		return Build{}, err
	}
	return build, nil
}

func (c *BuildkiteClient) DownloadArtifacts(ctx context.Context, build Build, root string) error {
	endpoint := fmt.Sprintf("%s/organizations/%s/pipelines/%s/builds/%d/artifacts", c.baseURL(), BuildkiteOrganization, BuildkitePipeline, build.Number)
	var artifacts []Artifact
	if err := c.getJSON(ctx, endpoint, &artifacts); err != nil {
		return err
	}
	manifest, err := ValidateArtifactManifest(artifacts)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("create artifact directory: %w", err)
	}

	for _, artifactPath := range expectedArtifactPaths {
		artifact := manifest[artifactPath]
		if artifact.DownloadURL == "" {
			return fmt.Errorf("artifact %q has no download URL", artifactPath)
		}
		destination := filepath.Join(root, filepath.Base(artifactPath))
		if err := c.download(ctx, artifact.DownloadURL, destination); err != nil {
			return fmt.Errorf("download %s: %w", artifactPath, err)
		}
	}
	return nil
}

func (c *BuildkiteClient) download(ctx context.Context, endpoint, destination string) (err error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	c.authorize(request)
	response, err := c.httpClient().Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return httpStatusError(response)
	}

	partial := destination + ".partial"
	file, err := os.OpenFile(partial, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = os.Remove(partial)
		}
	}()
	if _, err = io.Copy(file, response.Body); err != nil {
		_ = file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	if err = os.Rename(partial, destination); err != nil {
		return err
	}
	return nil
}

func (c *BuildkiteClient) getJSON(ctx context.Context, endpoint string, target any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	c.authorize(request)
	response, err := c.httpClient().Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return httpStatusError(response)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("decode Buildkite response: %w", err)
	}
	return nil
}

func (c *BuildkiteClient) authorize(request *http.Request) {
	request.Header.Set("Authorization", "Bearer "+c.Token)
	request.Header.Set("Accept", "application/json")
}

func (c *BuildkiteClient) baseURL() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/")
	}
	return defaultBuildkiteBaseURL
}

func (c *BuildkiteClient) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return httpproxy.ClientWithTimeout(30 * time.Second)
}

func (c *BuildkiteClient) pollInterval() time.Duration {
	if c.PollInterval > 0 {
		return c.PollInterval
	}
	return 15 * time.Second
}

func (c *BuildkiteClient) sleep(ctx context.Context, duration time.Duration) error {
	if c.Sleep != nil {
		return c.Sleep(ctx, duration)
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func httpStatusError(response *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
	message := strings.TrimSpace(string(body))
	if message == "" {
		return fmt.Errorf("HTTP %s", response.Status)
	}
	return fmt.Errorf("HTTP %s: %s", response.Status, message)
}

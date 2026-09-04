package releasepromotion

import (
	"fmt"
	"path"
	"regexp"
	"sort"
	"strings"
)

const (
	GitHubRepository      = "Automattic/vip-cli"
	BuildkiteOrganization = "automattic"
	BuildkitePipeline     = "vip-cli"
	TrunkRef              = "refs/heads/trunk"
)

var prereleaseVersionPattern = regexp.MustCompile(`^5\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-(alpha|beta|rc)\.(0|[1-9][0-9]*)$`)

var expectedArtifactPaths = []string{
	"dist/vip-next-darwin-amd64.tar.gz",
	"dist/vip-next-darwin-amd64.tar.gz.sha256",
	"dist/vip-next-darwin-arm64.tar.gz",
	"dist/vip-next-darwin-arm64.tar.gz.sha256",
	"dist/vip-next-linux-amd64.tar.gz",
	"dist/vip-next-linux-amd64.tar.gz.sha256",
	"dist/vip-next-linux-arm64.tar.gz",
	"dist/vip-next-linux-arm64.tar.gz.sha256",
	"dist/vip-next-windows-amd64.tar.gz",
	"dist/vip-next-windows-amd64.tar.gz.sha256",
}

type Artifact struct {
	ID          string `json:"id"`
	JobID       string `json:"job_id"`
	Path        string `json:"path"`
	Filename    string `json:"filename"`
	State       string `json:"state"`
	DownloadURL string `json:"download_url"`
}

func ValidateRequest(version, ref string) error {
	if !prereleaseVersionPattern.MatchString(version) {
		return fmt.Errorf("invalid prerelease version %q; expected an unprefixed 5.x prerelease such as 5.0.0-beta.1", version)
	}
	if ref != TrunkRef {
		return fmt.Errorf("invalid workflow ref %q; prereleases must run from %s", ref, TrunkRef)
	}
	return nil
}

func ExpectedArtifactPaths() []string {
	return append([]string(nil), expectedArtifactPaths...)
}

func ValidateArtifactManifest(artifacts []Artifact) (map[string]Artifact, error) {
	expected := make(map[string]struct{}, len(expectedArtifactPaths))
	for _, artifactPath := range expectedArtifactPaths {
		expected[artifactPath] = struct{}{}
	}

	manifest := make(map[string]Artifact, len(artifacts))
	var unexpected []string
	var unfinished []string
	var duplicates []string
	for _, artifact := range artifacts {
		artifactPath := path.Clean(artifact.Path)
		if artifactPath != artifact.Path {
			unexpected = append(unexpected, artifact.Path)
			continue
		}
		if _, ok := expected[artifactPath]; !ok {
			unexpected = append(unexpected, artifactPath)
			continue
		}
		if _, ok := manifest[artifactPath]; ok {
			duplicates = append(duplicates, artifactPath)
			continue
		}
		manifest[artifactPath] = artifact
		if artifact.State != "finished" {
			unfinished = append(unfinished, artifactPath)
		}
	}

	var missing []string
	for _, artifactPath := range expectedArtifactPaths {
		if _, ok := manifest[artifactPath]; !ok {
			missing = append(missing, artifactPath)
		}
	}

	if len(missing)+len(unexpected)+len(unfinished)+len(duplicates) > 0 {
		sort.Strings(missing)
		sort.Strings(unexpected)
		sort.Strings(unfinished)
		sort.Strings(duplicates)
		var problems []string
		if len(missing) > 0 {
			problems = append(problems, "missing artifacts: "+strings.Join(missing, ", "))
		}
		if len(unexpected) > 0 {
			problems = append(problems, "unexpected artifacts: "+strings.Join(unexpected, ", "))
		}
		if len(duplicates) > 0 {
			problems = append(problems, "duplicate artifacts: "+strings.Join(duplicates, ", "))
		}
		if len(unfinished) > 0 {
			problems = append(problems, "artifacts not finished: "+strings.Join(unfinished, ", "))
		}
		return nil, fmt.Errorf("invalid Buildkite artifact manifest: %s", strings.Join(problems, "; "))
	}

	return manifest, nil
}

package releasepromotion

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
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
	"dist/vip-next-darwin-amd64.pkg",
	"dist/vip-next-darwin-amd64.pkg.sha256",
	"dist/vip-next-darwin-arm64.pkg",
	"dist/vip-next-darwin-arm64.pkg.sha256",
	"dist/vip-next-windows-amd64.msi",
	"dist/vip-next-windows-amd64.msi.sha256",
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
		normalizedPath := strings.ReplaceAll(artifact.Path, `\`, "/")
		artifactPath := path.Clean(normalizedPath)
		if artifactPath != normalizedPath {
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
		artifact.Path = artifactPath
		manifest[artifactPath] = artifact
		if artifact.State != "finished" {
			unfinished = append(unfinished, artifactPath)
		}
	}

	var missing []string
	for _, artifactPath := range expectedArtifactPaths {
		if _, ok := manifest[artifactPath]; !ok {
			// Portable binaries are mandatory. Installers are optional, but a
			// package and its checksum must always be present together.
			companion := strings.TrimSuffix(artifactPath, ".sha256")
			if companion == artifactPath {
				companion += ".sha256"
			}
			_, paired := manifest[companion]
			if strings.Contains(artifactPath, ".tar.gz") || paired {
				missing = append(missing, artifactPath)
			}
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

// localArtifactPaths applies the same contract to downloads before upload. It
// also rejects unknown files and non-regular entries instead of publishing them.
func localArtifactPaths(root string) ([]string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	var artifacts []Artifact
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf("replacement asset %q is not a regular file", entry.Name())
		}
		artifacts = append(artifacts, Artifact{Path: "dist/" + entry.Name(), State: "finished"})
	}
	manifest, err := ValidateArtifactManifest(artifacts)
	if err != nil {
		return nil, err
	}
	paths := make([]string, 0, len(manifest))
	for _, p := range expectedArtifactPaths {
		if _, ok := manifest[p]; ok {
			paths = append(paths, filepath.Base(p))
		}
	}
	return paths, nil
}

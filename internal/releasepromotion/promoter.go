package releasepromotion

import (
	"context"
	"fmt"
	"os"
	"regexp"
)

var fullCommitPattern = regexp.MustCompile(`^[0-9a-fA-F]{40}$`)

type Request struct {
	Version   string
	Ref       string
	Commit    string
	OutputDir string
}

type VerifyRequest struct {
	BuildNumber int
	Commit      string
	OutputDir   string
}

type BuildkiteAPI interface {
	WaitForTaggedBuild(context.Context, string, string) (Build, error)
	GetBuild(context.Context, int) (Build, error)
	DownloadArtifacts(context.Context, Build, string) error
}

type GitHubAPI interface {
	EnsureDraft(context.Context, string, string) (Release, error)
	ReplaceAssets(context.Context, Release, string) error
	PublishPrerelease(context.Context, Release) error
}

type Promoter struct {
	Buildkite BuildkiteAPI
	GitHub    GitHubAPI
}

func (p Promoter) Publish(ctx context.Context, request Request) error {
	if err := ValidateRequest(request.Version, request.Ref); err != nil {
		return err
	}
	if err := validateCommit(request.Commit); err != nil {
		return err
	}
	if p.Buildkite == nil || p.GitHub == nil {
		return fmt.Errorf("release promotion clients are not configured")
	}

	root, cleanup, err := artifactDirectory(request.OutputDir)
	if err != nil {
		return err
	}
	defer cleanup()

	release, err := p.GitHub.EnsureDraft(ctx, request.Version, request.Commit)
	if err != nil {
		return fmt.Errorf("prepare draft release: %w", err)
	}
	build, err := p.Buildkite.WaitForTaggedBuild(ctx, request.Version, request.Commit)
	if err != nil {
		return fmt.Errorf("wait for Buildkite: %w", err)
	}
	if err := p.Buildkite.DownloadArtifacts(ctx, build, root); err != nil {
		return fmt.Errorf("download Buildkite artifacts: %w", err)
	}
	if err := VerifyDownloads(root); err != nil {
		return fmt.Errorf("verify Buildkite artifacts: %w", err)
	}
	if err := p.GitHub.ReplaceAssets(ctx, release, root); err != nil {
		return fmt.Errorf("replace draft assets: %w", err)
	}
	if err := p.GitHub.PublishPrerelease(ctx, release); err != nil {
		return fmt.Errorf("publish prerelease: %w", err)
	}
	return nil
}

func (p Promoter) VerifyBuild(ctx context.Context, request VerifyRequest) error {
	if request.BuildNumber <= 0 {
		return fmt.Errorf("build number must be positive")
	}
	if err := validateCommit(request.Commit); err != nil {
		return err
	}
	if request.OutputDir == "" {
		return fmt.Errorf("output directory is required")
	}
	if p.Buildkite == nil {
		return fmt.Errorf("Buildkite client is not configured")
	}

	build, err := p.Buildkite.GetBuild(ctx, request.BuildNumber)
	if err != nil {
		return fmt.Errorf("get Buildkite build: %w", err)
	}
	if build.Commit != request.Commit {
		return fmt.Errorf("Buildkite build %d is for a different commit %q; expected %q", build.Number, build.Commit, request.Commit)
	}
	if build.State != "passed" {
		return fmt.Errorf("Buildkite build %d is not passed; state is %q", build.Number, build.State)
	}
	if err := p.Buildkite.DownloadArtifacts(ctx, build, request.OutputDir); err != nil {
		return fmt.Errorf("download Buildkite artifacts: %w", err)
	}
	if err := VerifyDownloads(request.OutputDir); err != nil {
		return fmt.Errorf("verify Buildkite artifacts: %w", err)
	}
	return nil
}

func validateCommit(commit string) error {
	if !fullCommitPattern.MatchString(commit) {
		return fmt.Errorf("commit %q must be a full 40-character hexadecimal SHA", commit)
	}
	return nil
}

func artifactDirectory(requested string) (string, func(), error) {
	if requested != "" {
		if err := os.MkdirAll(requested, 0o755); err != nil {
			return "", func() {}, fmt.Errorf("create artifact directory: %w", err)
		}
		return requested, func() {}, nil
	}
	root, err := os.MkdirTemp("", "vip-next-prerelease-")
	if err != nil {
		return "", func() {}, fmt.Errorf("create temporary artifact directory: %w", err)
	}
	return root, func() { _ = os.RemoveAll(root) }, nil
}

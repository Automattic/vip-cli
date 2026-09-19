package releasepromotion

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type fakeBuildkiteAPI struct {
	events      *[]string
	waitBuild   Build
	waitErr     error
	getBuild    Build
	getErr      error
	downloadErr error
	download    func(string)
}

func (f *fakeBuildkiteAPI) WaitForTaggedBuild(context.Context, string, string) (Build, error) {
	*f.events = append(*f.events, "wait")
	return f.waitBuild, f.waitErr
}

func (f *fakeBuildkiteAPI) GetBuild(context.Context, int) (Build, error) {
	*f.events = append(*f.events, "get")
	return f.getBuild, f.getErr
}

func (f *fakeBuildkiteAPI) DownloadArtifacts(_ context.Context, _ Build, root string) error {
	*f.events = append(*f.events, "download")
	if f.download != nil {
		f.download(root)
	}
	return f.downloadErr
}

type fakeGitHubAPI struct {
	events     *[]string
	release    Release
	ensureErr  error
	replaceErr error
	publishErr error
}

func (f *fakeGitHubAPI) EnsureDraft(context.Context, string, string) (Release, error) {
	*f.events = append(*f.events, "ensure")
	return f.release, f.ensureErr
}

func (f *fakeGitHubAPI) ReplaceAssets(context.Context, Release, string) error {
	*f.events = append(*f.events, "replace")
	return f.replaceErr
}

func (f *fakeGitHubAPI) PublishPrerelease(context.Context, Release) error {
	*f.events = append(*f.events, "publish")
	return f.publishErr
}

func TestPublishPublishesOnlyAfterArtifactVerification(t *testing.T) {
	events := []string{}
	buildkite := &fakeBuildkiteAPI{events: &events, waitBuild: Build{Number: 28, State: "passed"}}
	buildkite.download = func(root string) {
		writeCompleteArtifactSet(t, root)
		events = append(events, "verified-fixture")
	}
	github := &fakeGitHubAPI{events: &events, release: Release{ID: 4, Draft: true}}
	promoter := Promoter{Buildkite: buildkite, GitHub: github}
	err := promoter.Publish(context.Background(), Request{
		Version: "5.0.0-beta.1",
		Ref:     TrunkRef,
		Commit:  strings.Repeat("a", 40),
	})
	if err != nil {
		t.Fatal(err)
	}
	want := "ensure,wait,download,verified-fixture,replace,publish"
	if got := strings.Join(events, ","); got != want {
		t.Fatalf("events = %q, want %q", got, want)
	}
}

func TestPublishRejectsInvalidRequestBeforeClientCalls(t *testing.T) {
	events := []string{}
	promoter := Promoter{
		Buildkite: &fakeBuildkiteAPI{events: &events},
		GitHub:    &fakeGitHubAPI{events: &events},
	}
	if err := promoter.Publish(context.Background(), Request{Version: "4.0.0", Ref: TrunkRef, Commit: strings.Repeat("a", 40)}); err == nil {
		t.Fatal("Publish() error = nil")
	}
	if len(events) != 0 {
		t.Fatalf("client calls = %v", events)
	}
}

func TestPublishLeavesDraftWhenBuildFails(t *testing.T) {
	events := []string{}
	promoter := Promoter{
		Buildkite: &fakeBuildkiteAPI{events: &events, waitErr: errors.New("build failed")},
		GitHub:    &fakeGitHubAPI{events: &events, release: Release{ID: 4, Draft: true}},
	}
	err := promoter.Publish(context.Background(), Request{Version: "5.0.0-beta.1", Ref: TrunkRef, Commit: strings.Repeat("a", 40)})
	if err == nil || strings.Join(events, ",") != "ensure,wait" {
		t.Fatalf("error = %v, events = %v", err, events)
	}
}

func TestPublishLeavesDraftWhenVerificationFails(t *testing.T) {
	events := []string{}
	promoter := Promoter{
		Buildkite: &fakeBuildkiteAPI{events: &events, waitBuild: Build{Number: 28, State: "passed"}},
		GitHub:    &fakeGitHubAPI{events: &events, release: Release{ID: 4, Draft: true}},
	}
	err := promoter.Publish(context.Background(), Request{Version: "5.0.0-beta.1", Ref: TrunkRef, Commit: strings.Repeat("a", 40)})
	if err == nil || strings.Join(events, ",") != "ensure,wait,download" {
		t.Fatalf("error = %v, events = %v", err, events)
	}
}

func TestVerifyBuildDoesNotCallGitHub(t *testing.T) {
	events := []string{}
	commit := strings.Repeat("b", 40)
	buildkite := &fakeBuildkiteAPI{events: &events, getBuild: Build{Number: 28, Commit: commit, State: "passed"}}
	buildkite.download = func(root string) { writeCompleteArtifactSet(t, root) }
	github := &fakeGitHubAPI{events: &events}
	promoter := Promoter{Buildkite: buildkite, GitHub: github}
	if err := promoter.VerifyBuild(context.Background(), VerifyRequest{BuildNumber: 28, Commit: commit, OutputDir: t.TempDir()}); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(events, ","); got != "get,download" {
		t.Fatalf("events = %q", got)
	}
}

func TestVerifyBuildRejectsCommitMismatchBeforeDownload(t *testing.T) {
	events := []string{}
	promoter := Promoter{Buildkite: &fakeBuildkiteAPI{
		events:   &events,
		getBuild: Build{Number: 28, Commit: strings.Repeat("a", 40), State: "passed"},
	}}
	err := promoter.VerifyBuild(context.Background(), VerifyRequest{BuildNumber: 28, Commit: strings.Repeat("b", 40), OutputDir: t.TempDir()})
	if err == nil || !strings.Contains(err.Error(), "different commit") || strings.Join(events, ",") != "get" {
		t.Fatalf("error = %v, events = %v", err, events)
	}
}

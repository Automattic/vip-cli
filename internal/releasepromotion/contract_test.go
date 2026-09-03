package releasepromotion

import (
	"reflect"
	"strings"
	"testing"
)

func TestValidateRequest(t *testing.T) {
	t.Parallel()
	tests := []struct {
		version string
		ref     string
		ok      bool
	}{
		{"5.0.0-beta.1", "refs/heads/trunk", true},
		{"5.12.3-alpha.10", "refs/heads/trunk", true},
		{"5.1.0-rc.2", "refs/heads/trunk", true},
		{"5.0.0", "refs/heads/trunk", false},
		{"v5.0.0-beta.1", "refs/heads/trunk", false},
		{"4.9.0-beta.1", "refs/heads/trunk", false},
		{"5.0.0-beta1", "refs/heads/trunk", false},
		{"5.0.0-beta.1", "refs/heads/feature", false},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.version+"/"+tt.ref, func(t *testing.T) {
			t.Parallel()
			err := ValidateRequest(tt.version, tt.ref)
			if (err == nil) != tt.ok {
				t.Errorf("ValidateRequest(%q, %q) error = %v, want ok=%v", tt.version, tt.ref, err, tt.ok)
			}
		})
	}
}

func TestValidateArtifactManifest(t *testing.T) {
	t.Parallel()
	expected := ExpectedArtifactPaths()
	artifacts := make([]Artifact, 0, len(expected))
	for i, artifactPath := range expected {
		artifacts = append(artifacts, Artifact{
			ID:          string(rune('a' + i)),
			Path:        artifactPath,
			Filename:    artifactPath,
			State:       "finished",
			DownloadURL: "https://example.invalid/artifact",
		})
	}

	manifest, err := ValidateArtifactManifest(artifacts)
	if err != nil {
		t.Fatal(err)
	}
	if len(manifest) != len(expected) {
		t.Fatalf("manifest length = %d, want %d", len(manifest), len(expected))
	}
	for _, artifactPath := range expected {
		if _, ok := manifest[artifactPath]; !ok {
			t.Errorf("manifest missing %q", artifactPath)
		}
	}
}

func TestValidateArtifactManifestRejectsInvalidSets(t *testing.T) {
	t.Parallel()
	valid := func() []Artifact {
		paths := ExpectedArtifactPaths()
		artifacts := make([]Artifact, 0, len(paths))
		for _, artifactPath := range paths {
			artifacts = append(artifacts, Artifact{Path: artifactPath, State: "finished"})
		}
		return artifacts
	}

	tests := []struct {
		name   string
		mutate func([]Artifact) []Artifact
		want   []string
	}{
		{
			name: "missing",
			mutate: func(artifacts []Artifact) []Artifact {
				return artifacts[1:]
			},
			want: []string{"missing", ExpectedArtifactPaths()[0]},
		},
		{
			name: "duplicate",
			mutate: func(artifacts []Artifact) []Artifact {
				return append(artifacts, artifacts[0])
			},
			want: []string{"duplicate", ExpectedArtifactPaths()[0]},
		},
		{
			name: "unexpected",
			mutate: func(artifacts []Artifact) []Artifact {
				return append(artifacts, Artifact{Path: "dist/notes.txt", State: "finished"})
			},
			want: []string{"unexpected", "dist/notes.txt"},
		},
		{
			name: "unfinished",
			mutate: func(artifacts []Artifact) []Artifact {
				artifacts[0].State = "uploading"
				return artifacts
			},
			want: []string{"not finished", ExpectedArtifactPaths()[0]},
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			_, err := ValidateArtifactManifest(tt.mutate(valid()))
			if err == nil {
				t.Fatal("ValidateArtifactManifest() error = nil")
			}
			for _, want := range tt.want {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("error %q does not contain %q", err, want)
				}
			}
		})
	}
}

func TestExpectedArtifactPathsReturnsCopy(t *testing.T) {
	t.Parallel()
	want := ExpectedArtifactPaths()
	got := ExpectedArtifactPaths()
	got[0] = "changed"
	if reflect.DeepEqual(got, want) {
		t.Fatal("ExpectedArtifactPaths returned shared storage")
	}
}

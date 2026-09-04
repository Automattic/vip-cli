package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestRunRejectsMissingModeWithoutReadingTokens(t *testing.T) {
	reads := 0
	err := run(context.Background(), nil, func(string) string {
		reads++
		return ""
	}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "usage") {
		t.Fatalf("error = %v", err)
	}
	if reads != 0 {
		t.Fatalf("environment token reads = %d", reads)
	}
}

func TestRunPublishRejectsMissingTokensBeforeNetwork(t *testing.T) {
	err := run(context.Background(), []string{
		"publish",
		"--version", "5.0.0-beta.1",
		"--ref", "refs/heads/trunk",
		"--commit", strings.Repeat("a", 40),
	}, func(string) string { return "" }, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "BUILDKITE_API_TOKEN") {
		t.Fatalf("error = %v", err)
	}
}

func TestRunVerifyBuildRejectsMissingTokenBeforeNetwork(t *testing.T) {
	err := run(context.Background(), []string{
		"verify-build",
		"--build", "28",
		"--commit", strings.Repeat("a", 40),
		"--output", t.TempDir(),
	}, func(string) string { return "" }, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "BUILDKITE_API_TOKEN") {
		t.Fatalf("error = %v", err)
	}
}

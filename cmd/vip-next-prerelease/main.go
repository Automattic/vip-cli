package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Automattic/vip/internal/releasepromotion"
)

const usage = `usage:
  vip-next-prerelease publish --version <tag> --ref <github-ref> --commit <full-sha>
  vip-next-prerelease verify-build --build <number> --commit <full-sha> --output <dir>`

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:], os.Getenv, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, getenv func(string) string, output io.Writer) error {
	if len(args) == 0 {
		return fmt.Errorf("%s", usage)
	}
	switch args[0] {
	case "publish":
		return runPublish(ctx, args[1:], getenv, output)
	case "verify-build":
		return runVerifyBuild(ctx, args[1:], getenv, output)
	default:
		return fmt.Errorf("unknown mode %q\n%s", args[0], usage)
	}
}

func runPublish(ctx context.Context, args []string, getenv func(string) string, output io.Writer) error {
	flags := flag.NewFlagSet("publish", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	version := flags.String("version", "", "unprefixed 5.x prerelease version")
	ref := flags.String("ref", "", "GitHub workflow ref")
	commit := flags.String("commit", "", "full release commit SHA")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("parse publish arguments: %w\n%s", err, usage)
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected publish arguments: %v\n%s", flags.Args(), usage)
	}
	if err := releasepromotion.ValidateRequest(*version, *ref); err != nil {
		return err
	}
	buildkiteToken := getenv("BUILDKITE_API_TOKEN")
	if buildkiteToken == "" {
		return fmt.Errorf("BUILDKITE_API_TOKEN is required")
	}
	githubToken := getenv("GITHUB_TOKEN")
	if githubToken == "" {
		return fmt.Errorf("GITHUB_TOKEN is required")
	}

	publishContext, cancel := context.WithTimeout(ctx, 50*time.Minute)
	defer cancel()
	promoter := releasepromotion.Promoter{
		Buildkite: &releasepromotion.BuildkiteClient{Token: buildkiteToken},
		GitHub:    &releasepromotion.GitHubClient{Token: githubToken},
	}
	if err := promoter.Publish(publishContext, releasepromotion.Request{Version: *version, Ref: *ref, Commit: *commit}); err != nil {
		return err
	}
	fmt.Fprintf(output, "Published VIP Next prerelease %s from commit %s.\n", *version, *commit)
	return nil
}

func runVerifyBuild(ctx context.Context, args []string, getenv func(string) string, output io.Writer) error {
	flags := flag.NewFlagSet("verify-build", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	buildNumber := flags.Int("build", 0, "Buildkite build number")
	commit := flags.String("commit", "", "full build commit SHA")
	outputDir := flags.String("output", "", "artifact output directory")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("parse verify-build arguments: %w\n%s", err, usage)
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected verify-build arguments: %v\n%s", flags.Args(), usage)
	}
	buildkiteToken := getenv("BUILDKITE_API_TOKEN")
	if buildkiteToken == "" {
		return fmt.Errorf("BUILDKITE_API_TOKEN is required")
	}
	promoter := releasepromotion.Promoter{
		Buildkite: &releasepromotion.BuildkiteClient{Token: buildkiteToken},
	}
	if err := promoter.VerifyBuild(ctx, releasepromotion.VerifyRequest{
		BuildNumber: *buildNumber,
		Commit:      *commit,
		OutputDir:   *outputDir,
	}); err != nil {
		return err
	}
	fmt.Fprintf(output, "Verified Buildkite build %d for commit %s in %s.\n", *buildNumber, *commit, *outputDir)
	return nil
}

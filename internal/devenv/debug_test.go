package devenv

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
	"github.com/Automattic/vip/internal/devenv/paths"
)

func fakeDebugDocker(t *testing.T) {
	t.Helper()
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	t.Setenv("DOCKER_HOST", "tcp://user:docker-secret@localhost:1234")
	bin := t.TempDir()
	t.Setenv("PATH", bin)
	// Only this fake is reachable; even an unexpected invocation cannot reach Docker.
	script := `#!/bin/sh
case "$*" in
  "compose version") exit 0 ;;
  "compose -p running ps --format json --all") echo '{"Service":"php","State":"running","ExitCode":0}' ;;
  "compose -p stopped ps --format json --all") echo '{"Service":"php","State":"exited","ExitCode":0}' ;;
  "compose -p failed ps --format json --all") echo 'private-docker-error' >&2; exit 1 ;;
  *) exit 1 ;;
esac
`
	if err := os.WriteFile(filepath.Join(bin, "docker"), []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
}

func TestListDebugExplainsStatusWithoutChangingResults(t *testing.T) {
	fakeDebugDocker(t)
	for _, slug := range []string{"failed", "running", "stopped"} {
		if err := os.MkdirAll(paths.EnvironmentPath(slug), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	for _, ns := range []string{"@automattic/vip:bin:dev-environment", "unrelated", ""} {
		t.Run(ns, func(t *testing.T) {
			var out bytes.Buffer
			got, err := List(debuglog.WithLogger(context.Background(), ns, &out))
			want := []EnvStatus{{Slug: "failed"}, {Slug: "running", Running: true}, {Slug: "stopped"}}
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("List = %#v, %v", got, err)
			}
			if ns != "@automattic/vip:bin:dev-environment" {
				if out.Len() != 0 {
					t.Fatalf("unexpected diagnostics: %s", &out)
				}
				return
			}
			for _, text := range []string{"Names found", "failed", "status query failed", "running=true", "running=false"} {
				if !strings.Contains(out.String(), text) {
					t.Errorf("missing %q in %s", text, &out)
				}
			}
			for _, secret := range []string{"docker-secret", "private-docker-error"} {
				if strings.Contains(out.String(), secret) {
					t.Errorf("leaked %q", secret)
				}
			}
		})
	}
}

func TestDevEnvDebugSummariesOmitArgumentsAndConfig(t *testing.T) {
	fakeDebugDocker(t)
	for _, tc := range []struct {
		name string
		run  func(context.Context) error
	}{
		{"create", func(ctx context.Context) error {
			return Create(ctx, CreateConfig{Title: "secret-title", Domain: "secret-domain"})
		}},
		{"update", func(ctx context.Context) error {
			value := "secret-config"
			return Update(ctx, "missing", UpdateConfig{XdebugConfig: &value})
		}},
		{"exec", func(ctx context.Context) error {
			return Exec(ctx, "missing", []string{"config", "set", "DB_PASSWORD", "secret-argument"})
		}},
		{"shell", func(ctx context.Context) error {
			return Shell(ctx, "missing", "php", false, []string{"echo", "secret-argument"})
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			_ = tc.run(debuglog.WithLogger(context.Background(), "@automattic/vip:bin:dev-environment", &out))
			if !strings.Contains(out.String(), tc.name) {
				t.Fatalf("missing operation diagnostic: %s", &out)
			}
			if strings.Contains(out.String(), "secret-") || strings.Contains(out.String(), "docker-secret") {
				t.Fatalf("secret in diagnostic: %s", &out)
			}
		})
	}
}

package lifecycle

import (
	"context"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/compose"
)

func TestRunSetupStepsIssuesExecs(t *testing.T) {
	d := &fakeDocker{}
	steps := []compose.SetupStep{
		{AsRoot: true, Command: "chown www-data:www-data /wp"},
		{AsRoot: false, Command: "sh /dev-tools/setup.sh --host database"},
	}
	if err := RunSetupSteps(context.Background(), d, "proj", steps); err != nil {
		t.Fatal(err)
	}
	if len(d.calls) != 2 {
		t.Fatalf("want 2 exec calls, got %d: %v", len(d.calls), d.calls)
	}
	root := strings.Join(d.calls[0], " ")
	if !strings.Contains(root, "exec") || !strings.Contains(root, "-u root") || !strings.Contains(root, "php") {
		t.Fatalf("root step not exec -u root php: %s", root)
	}
	// TERM is set so setup.sh's tput calls don't warn on every line.
	if !strings.Contains(root, "-e TERM=xterm") {
		t.Fatalf("setup step missing TERM env: %s", root)
	}
	if !strings.Contains(root, "chown www-data:www-data /wp") {
		t.Fatalf("root command missing: %s", root)
	}
	user := strings.Join(d.calls[1], " ")
	if strings.Contains(user, "-u root") {
		t.Fatalf("non-root step must not use -u root: %s", user)
	}
	// The php image runs as root by default, so the non-root step MUST set
	// -u www-data explicitly or wp-cli refuses to run ("running as root").
	if !strings.Contains(user, "-u www-data") {
		t.Fatalf("non-root step must run as www-data: %s", user)
	}
	if !strings.Contains(user, "sh -c") || !strings.Contains(user, "setup.sh") {
		t.Fatalf("user step not exec sh -c: %s", user)
	}
}

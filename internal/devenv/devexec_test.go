package devenv

import (
	"testing"

	"github.com/Automattic/vip/internal/devenv/dockercli"
)

func pinnedRunner() *dockercli.Runner {
	r := &dockercli.Runner{}
	r.SetComposeCmdForTest([]string{"docker", "compose"})
	return r
}

func TestExecArgv(t *testing.T) {
	r := pinnedRunner()
	got := execArgv(r, "myslug", []string{"post", "list", "--format=json"}, false)
	want := []string{"docker", "compose", "-p", "myslug", "exec", "php", "wp", "--allow-root", "post", "list", "--format=json"}
	assertArgv(t, got, want)
}

// TestExecArgvNoTTY: when stdin is not a terminal (piped output), -T is inserted
// to disable docker compose's default pseudo-TTY allocation.
func TestExecArgvNoTTY(t *testing.T) {
	r := pinnedRunner()
	got := execArgv(r, "myslug", []string{"post", "list"}, true)
	want := []string{"docker", "compose", "-p", "myslug", "exec", "-T", "php", "wp", "--allow-root", "post", "list"}
	assertArgv(t, got, want)
}

func TestShellArgvDefaultPHP(t *testing.T) {
	r := pinnedRunner()
	got := shellArgv(r, "s", "php", false, nil, false)
	// No command + interactive (TTY): prefer bash with -i (Node landoShell parity),
	// fall back to sh for containers without bash.
	want := []string{"docker", "compose", "-p", "s", "exec", "-u", "www-data", "php",
		"/bin/sh", "-c", "if [ -x /bin/bash ]; then /bin/bash -i; else /bin/sh -i; fi; exit 0"}
	assertArgv(t, got, want)
}

// TestShellArgvDefaultNonInteractive: no command + piped stdin drops the -i flag
// (matches Node's stdin.isTTY gate) and adds -T.
func TestShellArgvDefaultNonInteractive(t *testing.T) {
	r := pinnedRunner()
	got := shellArgv(r, "s", "php", false, nil, true)
	want := []string{"docker", "compose", "-p", "s", "exec", "-T", "-u", "www-data", "php",
		"/bin/sh", "-c", "if [ -x /bin/bash ]; then /bin/bash; else /bin/sh; fi; exit 0"}
	assertArgv(t, got, want)
}

func TestShellArgvRootWithCmd(t *testing.T) {
	r := pinnedRunner()
	got := shellArgv(r, "s", "database", true, []string{"ls", "-lha"}, false)
	want := []string{"docker", "compose", "-p", "s", "exec", "-u", "root", "database", "ls", "-lha"}
	assertArgv(t, got, want)
}

// TestShellArgvNoTTY: -T precedes the -u/service options when non-interactive.
func TestShellArgvNoTTY(t *testing.T) {
	r := pinnedRunner()
	got := shellArgv(r, "s", "database", false, []string{"ls"}, true)
	want := []string{"docker", "compose", "-p", "s", "exec", "-T", "-u", "mysql", "database", "ls"}
	assertArgv(t, got, want)
}

func TestShellUserMapping(t *testing.T) {
	if shellUser("php", false) != "www-data" {
		t.Fatal("php non-root should map to www-data")
	}
	if shellUser("database", false) != "mysql" {
		t.Fatal("database non-root should map to mysql")
	}
	if shellUser("php", true) != "root" {
		t.Fatal("root flag should force root")
	}
	if shellUser("unknown-svc", false) != "www-data" {
		t.Fatal("unknown service should default to www-data")
	}
}

func assertArgv(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("argv = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("argv[%d] = %q, want %q (full %v)", i, got[i], want[i], got)
		}
	}
}

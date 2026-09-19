// Package scripts_test exercises the repo's shell tooling.
//
// vip-next-command-catalog.sh is a cutover gate: it walks every vip-next
// command and reports pass/fail. Its `run_expected_failure` helper documents
// calls that MUST be rejected — most importantly `vip sync` targeting
// production. A gate that cannot fail is not a gate, so these tests drive the
// script from both sides: a stub CLI that rejects the call (the documented
// behaviour) and a stub CLI that accepts it (the regression the gate exists to
// catch).
package scripts_test

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// catalogStub writes a fake vip-next. In "reject-sync" mode it exits 1 for the
// platform `sync` invocation (what the real CLI does today: production is not a
// valid sync target); in "accept-everything" mode it exits 0 for every call,
// simulating a future regression where vip-next starts ACCEPTING a sync into
// production.
func catalogStub(t *testing.T, mode string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "vip-next-stub")

	body := `#!/usr/bin/env bash
# Fake vip-next for catalog-script tests.
mode="` + mode + `"
args="$*"
if [[ "$mode" == "reject-sync" ]]; then
	# The platform ` + "`sync`" + ` catalog entry is the only bare "sync" call;
	# "dev-env sync --help" and "dev-env sync sql" must stay successful.
	if [[ " $args " == *" sync "* || " $args " == *" sync" ]]; then
		if [[ "$args" != *"--help"* && "$args" != *"dev-env"* ]]; then
			echo "sync into production is not permitted" >&2
			exit 1
		fi
	fi
fi
exit 0
`
	if err := os.WriteFile(path, []byte(body), 0o755); err != nil { // #nosec G306
		t.Fatalf("write stub: %v", err)
	}
	return path
}

// runCatalog executes the catalog script with only the read-only and
// expected-failure gates open. No mutating or destructive entry can run.
func runCatalog(t *testing.T, stub string) (string, int) {
	t.Helper()
	cmd := exec.Command("bash", "./vip-next-command-catalog.sh")
	cmd.Env = append(os.Environ(),
		"VIP_NEXT="+stub,
		"RUN=1",
		"ALLOW_EXPECTED_FAILURES=1",
		"ALLOW_INTERACTIVE=0",
		"ALLOW_MUTATIONS=0",
		"ALLOW_DESTRUCTIVE=0",
	)
	out, err := cmd.CombinedOutput()
	code := 0
	if err != nil {
		var exitErr *exec.ExitError
		if !errors.As(err, &exitErr) {
			t.Fatalf("run catalog script: %v\n%s", err, out)
		}
		code = exitErr.ExitCode()
	}
	return string(out), code
}

func requireBash(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("catalog script is bash-only")
	}
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
}

// TestCatalogExpectedFailureAcceptsARejection is the documented happy path: the
// CLI refuses the invalid call, the script records an expected failure, and the
// suite still succeeds.
func TestCatalogExpectedFailureAcceptsARejection(t *testing.T) {
	requireBash(t)

	out, code := runCatalog(t, catalogStub(t, "reject-sync"))

	if code != 0 {
		t.Fatalf("catalog exit = %d, want 0 when the expected failure actually failed\n%s", code, out)
	}
	if !strings.Contains(out, "expected-failures=1") {
		t.Errorf("summary did not record the expected failure:\n%s", out)
	}
}

// TestCatalogExpectedFailureFailsWhenTheCommandSucceeds is the reason this file
// exists. `run_expected_failure` used to treat BOTH a zero and a non-zero exit
// as success, so the gate would report PASS if vip-next started accepting a
// sync into production. A zero exit MUST fail the suite.
func TestCatalogExpectedFailureFailsWhenTheCommandSucceeds(t *testing.T) {
	requireBash(t)

	out, code := runCatalog(t, catalogStub(t, "accept-everything"))

	if code == 0 {
		t.Fatalf("catalog exit = 0; an expected-failure command that SUCCEEDED must fail the suite\n%s", out)
	}
	if !strings.Contains(out, "expected-failure command unexpectedly succeeded") {
		t.Errorf("output does not explain why the suite failed:\n%s", out)
	}
	if !strings.Contains(out, "expected-failures=0") {
		t.Errorf("a zero exit must not be counted as an expected failure:\n%s", out)
	}
}

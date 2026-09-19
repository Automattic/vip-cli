package devenv

import (
	"errors"
	"strings"
	"testing"
)

// Node's `dev-env stop --all` wraps each stopEnvironment in its own try/catch:
// a failure prints an error, sets process.exitCode = 1, and the loop CONTINUES
// to the next environment (vip-dev-env-stop.js:72-100). vip-next returned on
// the first error, leaving the remaining environments running — so one broken
// environment stopped `stop --all` from stopping anything after it.
func TestStopAllContinuesPastAFailure(t *testing.T) {
	var seen []string
	err := stopEachEnv([]string{"a", "bad", "c"}, func(slug string) error {
		seen = append(seen, slug)
		if slug == "bad" {
			return errors.New("container is wedged")
		}
		return nil
	})
	if err == nil {
		t.Fatal("a failed environment must still fail the command (Node sets exitCode 1)")
	}
	if got := strings.Join(seen, ","); got != "a,bad,c" {
		t.Errorf("visited %q; every environment must be attempted", got)
	}
	if !strings.Contains(err.Error(), "bad") || !strings.Contains(err.Error(), "container is wedged") {
		t.Errorf("error %q should name the failing environment and its cause", err)
	}
}

func TestStopAllSucceedsWhenAllSucceed(t *testing.T) {
	if err := stopEachEnv([]string{"a", "b"}, func(string) error { return nil }); err != nil {
		t.Fatalf("err = %v, want nil", err)
	}
}

// Node's purge has the same shape (vip-dev-env-purge.js:85-98): each
// destroyEnvironment is individually caught, exitCode is set to 1, and the loop
// continues. vip-next aborted on the first failure, leaving a half-purged
// machine that the user then had to clean up by hand.
func TestPurgeContinuesPastAFailure(t *testing.T) {
	var seen []string
	err := purgeEachEnv([]string{"a", "bad", "c"}, func(slug string) error {
		seen = append(seen, slug)
		if slug == "bad" {
			return errors.New("volume in use")
		}
		return nil
	})
	if err == nil {
		t.Fatal("a failed environment must still fail purge")
	}
	if got := strings.Join(seen, ","); got != "a,bad,c" {
		t.Errorf("visited %q; purge must attempt every environment", got)
	}
}

// Node deletes the environment directory INSIDE destroyEnvironment, with a bare
// `fs.promises.rm( instancePath, { recursive: true } )` — note: no
// `force: true` (src/lib/dev-environment/dev-environment-core.ts:381-382). A
// failed removal therefore rejects, and the purge bin catches it per environment
// and sets `process.exitCode = 1` (src/bin/vip-dev-env-purge.js:92-97).
//
// vip-next's Purge did `_ = removeEnvFiles(slug)`. When removal failed (a
// read-only parent, a busy or immutable file) the environment's config survived
// — so it was still listed by `dev-env list` and still counted by
// instancedata.AllNames() — while purge reported success and exited 0. Note the
// single-environment Destroy path already propagated the same error, so this
// was an inconsistency inside vip-next as well as against Node.
func TestPurgeStepFailsWhenEnvFilesCannotBeRemoved(t *testing.T) {
	removeCalls := 0
	step := purgeEnvStep(
		func(string) error { return nil },
		func(string) error { removeCalls++; return errors.New("permission denied") },
		false, // not a soft purge → files must be removed
	)
	err := step("wedged")
	if err == nil {
		t.Fatal("a failed environment-files removal must fail the purge (Node exits 1)")
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("error %q should carry the removal failure", err)
	}
	if removeCalls != 1 {
		t.Errorf("removeEnvFiles called %d times, want 1", removeCalls)
	}
}

// A soft purge keeps the config files (Node's `--soft`), so removal must not be
// attempted at all — and its hypothetical failure must not surface.
func TestPurgeStepSoftSkipsFileRemoval(t *testing.T) {
	step := purgeEnvStep(
		func(string) error { return nil },
		func(string) error { t.Error("soft purge must not remove environment files"); return errors.New("boom") },
		true,
	)
	if err := step("kept"); err != nil {
		t.Fatalf("err = %v, want nil", err)
	}
}

// A destroy failure short-circuits: removal is not attempted on an environment
// whose containers are still up.
func TestPurgeStepDestroyFailureSkipsRemoval(t *testing.T) {
	step := purgeEnvStep(
		func(string) error { return errors.New("volume in use") },
		func(string) error { t.Error("must not remove files after a failed destroy"); return nil },
		false,
	)
	err := step("busy")
	if err == nil || !strings.Contains(err.Error(), "volume in use") {
		t.Fatalf("err = %v, want the destroy failure", err)
	}
}

// Every failure is reported, not just the first.
func TestPurgeReportsEveryFailure(t *testing.T) {
	err := purgeEachEnv([]string{"x", "y"}, func(slug string) error {
		return errors.New("nope-" + slug)
	})
	if err == nil {
		t.Fatal("want an error")
	}
	for _, want := range []string{"nope-x", "nope-y"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q missing %q", err, want)
		}
	}
}

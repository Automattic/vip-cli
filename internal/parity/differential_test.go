//go:build parity

package parity

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
)

// General scenarios share a server and build, and authenticate both runtimes
// with VIP_CLI_TOKEN. Auth-specific tests lazily seed host-scoped credentials
// through ensureStoredCredentials; teardown removes them even after a failure.
// Handlers are swapped between scenarios, so differential tests must be sequential.
type differentialRig struct {
	nodeBin string
	goBin   string
	srv     *httptest.Server
	handler atomic.Pointer[http.Handler]
	token   string

	// binDir is removed at teardown; the built binary has to outlive whichever
	// test happened to construct the rig.
	binDir            string
	storedCredentials bool
}

var (
	rigOnce  sync.Once
	rig      *differentialRig
	rigSkip  string
	rigFatal error
)

// differentialAvailable returns the shared rig, or a reason to skip.
//
// Callers must treat a non-empty skip reason as a LOUD skip (LoudSkip), never
// as a pass: on a host where the Node CLI cannot be run or its credential
// store cannot be driven, the differential compares nothing, and a silent
// green there is precisely the failure this whole area exists to remove.
func differentialAvailable(t *testing.T) (*differentialRig, string) {
	t.Helper()
	rigOnce.Do(setupDifferentialRig)
	if rigFatal != nil {
		// A harness bug (a bad build, a service-name derivation that has
		// drifted from Node's) is not a hostile environment. Fail.
		t.Fatalf("differential rig: %v", rigFatal)
	}
	return rig, rigSkip
}

func setupDifferentialRig() {
	node := ResolveNodeVipBin(os.Getenv("NODE_VIP_BIN"), DefaultNodeVipBinProbe())
	if !node.Ready {
		rigSkip = node.Reason
		return
	}

	binDir, err := os.MkdirTemp("", "vip-next-differential")
	if err != nil {
		rigFatal = fmt.Errorf("temp dir for the Go binary: %w", err)
		return
	}
	goBin, err := buildVipNextInto(binDir, "test", "test")
	if err != nil {
		_ = os.RemoveAll(binDir)
		rigFatal = err
		return
	}

	r := &differentialRig{nodeBin: node.Path, goBin: goBin, binDir: binDir, token: FixtureToken()}
	r.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		h := r.handler.Load()
		if h == nil {
			// A request outside any scenario is a harness bug, not data.
			// Answer with something that cannot be mistaken for a payload.
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"errors":[{"message":"parity: no scenario handler installed"}]}`))
			return
		}
		(*h).ServeHTTP(w, req)
	}))

	rig = r
}

// teardownDifferentialRig is called from TestMain AFTER m.Run(). It is the
// only place the shared credential is removed, and it runs whether the suite
// passed, failed, or panicked out of an individual test.
func teardownDifferentialRig() {
	if rig == nil {
		return
	}
	if rig.srv != nil {
		rig.srv.Close()
	}
	if rig.storedCredentials {
		if err := cleanupStoredCredentials(rig.nodeBin, rig.srv.URL); err != nil {
			fmt.Fprintf(os.Stderr, "parity differential: credential cleanup failed: %v\n", err)
		}
	}

	if rig.binDir != "" {
		_ = os.RemoveAll(rig.binDir)
	}
}

// serve installs h as the handler for the rest of the current subtest and
// restores the previous one afterwards.
func (r *differentialRig) serve(t *testing.T, h http.Handler) {
	t.Helper()
	previous := r.handler.Load()
	r.handler.Store(&h)
	t.Cleanup(func() { r.handler.Store(previous) })
}

// scenarioEnv supplies the same environment PAT to both runtimes by default.
// Explicit scenario credentials (including an empty value) take precedence.
func (r *differentialRig) scenarioEnv(s *Scenario) map[string]string {
	env := map[string]string{"VIP_CLI_TOKEN": r.token}
	for k, v := range s.Env {
		env[k] = v
	}
	env["API_HOST"] = r.srv.URL
	return env
}

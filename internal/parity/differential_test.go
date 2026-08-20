//go:build parity

package parity

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
)

// The shared Node-vs-Go rig.
//
// WHY A SINGLETON
//
// Every differential scenario needs the Node CLI authenticated, and since
// trunk 4.1.0 the ONLY way to authenticate it is a real credential-store write
// (Token.get reads getKeychain() and nothing else; there has never been an env
// escape hatch — see keychain.go). Node derives the service name from
// API_HOST, so a per-scenario httptest server means a per-scenario service
// name: 30-odd credentials created and destroyed per run, 30-odd chances to
// leak one, and 30-odd chances for a SIGKILL to strand one. A previous
// incarnation of that pattern left 727 orphaned entries to be purged by hand.
//
// So the whole test binary shares ONE httptest server, therefore ONE API_HOST,
// therefore ONE seeded credential — written once before the first differential
// runs and deleted once after the last one finishes. The count of credentials
// a full run creates is a constant, not a function of how many scenarios
// exist, which is the property that keeps "before == after" true as scenarios
// are added.
//
// The cost is that the server's handler has to change per scenario. It is held
// in an atomic and swapped by each subtest; differential subtests therefore
// MUST NOT call t.Parallel(). TestDifferentialScenariosAreSequential documents
// and does not enforce that — the swap itself is race-free, but two scenarios
// interleaving would serve each other's recordings.
type differentialRig struct {
	nodeBin string
	goBin   string
	srv     *httptest.Server
	handler atomic.Pointer[http.Handler]
	token   string

	// binDir is removed at teardown; the built binary has to outlive whichever
	// test happened to construct the rig.
	binDir string
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

	// Publish the rig BEFORE seeding, so teardown collects a partial write.
	rig = r

	switch err := SeedNodeKeychainToken(r.nodeBin, r.srv.URL, r.token); {
	case errors.Is(err, ErrKeychainSeedMismatch):
		rigFatal = fmt.Errorf("seeding the Node credential: %w", err)
	case err != nil:
		rigSkip = "the credential store could not be driven, and the Node CLI has no other " +
			"way to authenticate (it has never had an environment escape hatch). Details: " +
			err.Error()
	}
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
	if err := CleanupParityCredentials(rig.nodeBin, rig.srv.URL); err != nil {
		fmt.Fprintf(os.Stderr, "parity differential: credential cleanup failed: %v\n", err)
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

// scenarioEnv is the environment both binaries get: the scenario's own
// overrides, plus the shared API_HOST, plus the Go-side token.
//
// The two CLIs receive the SAME credential by two different routes — Node from
// the seeded store, Go from VIP_TOKEN_OVERRIDE under GO_ENV=test. Minting it
// once and handing the same string to both is what keeps these scenarios a
// test of command output rather than of credential plumbing, and it is what
// lets the ~50 mock-only scenarios stay off the credential store entirely.
func (r *differentialRig) scenarioEnv(s *Scenario) map[string]string {
	env := map[string]string{}
	for k, v := range s.Env {
		env[k] = v
	}
	env["API_HOST"] = r.srv.URL
	env["VIP_TOKEN_OVERRIDE"] = r.token
	return env
}

package commands

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/appctx"
)

// ctxWithAppEnvTyped builds a context with a known TypeId (for update command
// tests that branch on app type).
func ctxWithAppEnvTyped(appID, envID int64, typeID int64) *appctx.AppEnv {
	return &appctx.AppEnv{
		App: appctx.App{ID: appID, Name: "testapp", TypeId: typeID},
		Env: appctx.Env{ID: envID, Name: "develop"},
	}
}

// softwareUpdateSequence is a multi-response stub that serves responses in
// order (first call → responses[0], second → responses[1], …, last repeated).
type softwareUpdateSequence struct {
	mu        sync.Mutex
	responses []string
	idx       int
	bodies    []string
}

func (s *softwareUpdateSequence) start(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s.mu.Lock()
		s.bodies = append(s.bodies, string(body))
		resp := s.responses[s.idx]
		if s.idx < len(s.responses)-1 {
			s.idx++
		}
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(resp))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func (s *softwareUpdateSequence) allBodies() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, len(s.bodies))
	copy(out, s.bodies)
	return out
}

func (s *softwareUpdateSequence) callCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.bodies)
}

// softwareUpdateSettingsBody is a SoftwareSettings response for a WP env (typeId 2)
// with wordpress options that include "managed_latest" and "6.4".
const softwareUpdateSettingsBody = `{"data":{"app":{"id":1,"name":"testapp","typeId":2,"environments":[{"id":2,"appId":1,"type":"develop","name":"develop","softwareSettings":{"wordpress":{"name":"WordPress","slug":"wordpress","pinned":false,"current":{"version":"6.3","default":false,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"6.4","private":false},"options":[{"version":"6.3","default":false,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"6.4","private":false},{"version":"6.4","default":true,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"6.4","private":false}]},"php":null,"muplugins":null,"nodejs":null}}]}}}`

const softwareUpdateMutationOKBody = `{"data":{"updateSoftwareSettings":{"wordpress":null,"php":null,"muplugins":null,"nodejs":null}}}`

// jobInProgress is the first poll response: inProgressLock=true, no terminal status.
const jobInProgress = `{"data":{"app":{"id":1,"environments":[{"id":2,"jobs":[{"__typename":"Job","type":"software_update","completedAt":null,"createdAt":"2024-01-01T00:00:00Z","inProgressLock":true,"progress":{"status":"running","steps":[]}}]}]}}}`

// jobSuccess is the second poll response: success.
const jobSuccess = `{"data":{"app":{"id":1,"environments":[{"id":2,"jobs":[{"__typename":"Job","type":"software_update","completedAt":"2024-01-01T00:01:00Z","createdAt":"2024-01-01T00:00:00Z","inProgressLock":false,"progress":{"status":"success","steps":[]}}]}]}}}`

// jobFailed has a step with status="failed".
const jobFailed = `{"data":{"app":{"id":1,"environments":[{"id":2,"jobs":[{"__typename":"Job","type":"software_update","completedAt":"2024-01-01T00:01:00Z","createdAt":"2024-01-01T00:00:00Z","inProgressLock":false,"progress":{"status":"failed","steps":[{"step":"apply","name":"Apply","status":"failed"}]}}]}]}}}`

func setupSoftwareUpdateConfig(srv *httptest.Server) {
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	SetConfig(Config{GQLClient: c})
}

// TestConfigSoftwareUpdateYesSkipsConfirmAndPollsToSuccess covers the happy
// path: --yes flag, mutation fires, poll transitions to success, exit 0.
func TestConfigSoftwareUpdateYesSkipsConfirmAndPollsToSuccess(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	// Response sequence: 1) SoftwareSettings (for validation), 2) UpdateSoftwareSettings mutation,
	// 3) first SoftwareUpdateJob poll (in progress), 4) second poll (success).
	seq := &softwareUpdateSequence{
		responses: []string{
			softwareUpdateSettingsBody,
			softwareUpdateMutationOKBody,
			jobInProgress,
			jobSuccess,
		},
	}
	srv := seq.start(t)
	setupSoftwareUpdateConfig(srv)
	defer SetConfig(Config{})

	// Make poll interval very short for tests.
	origInterval := softwareUpdatePollInterval
	softwareUpdatePollInterval = 10 * time.Millisecond
	defer func() { softwareUpdatePollInterval = origInterval }()

	cmd := ConfigSoftwareUpdateCmd()
	_ = cmd.Flags().Set("yes", "true")
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	ae := ctxWithAppEnvTyped(1, 2, 2)
	cmd.SetContext(appctx.WithAppEnv(ctxWithAppEnv(1, 2), ae))

	if err := runConfigSoftwareUpdate(cmd, []string{"wordpress", "6.4"}); err != nil {
		t.Fatalf("runConfigSoftwareUpdate: %v", err)
	}

	bodies := seq.allBodies()
	// Must have fired at least 4 calls: settings + mutation + 2 polls
	if len(bodies) < 4 {
		t.Errorf("expected at least 4 GQL calls, got %d", len(bodies))
	}
	// Mutation must have been called.
	found := false
	for _, b := range bodies {
		if strings.Contains(b, "UpdateSoftwareSettings") {
			found = true
		}
	}
	if !found {
		t.Errorf("UpdateSoftwareSettings mutation was not fired; bodies=%v", bodies)
	}
	// Success output.
	if !strings.Contains(stdout.String(), "success") && !strings.Contains(stdout.String(), "updated") &&
		!strings.Contains(stdout.String(), "Success") && !strings.Contains(stdout.String(), "complete") {
		t.Errorf("expected success message in stdout; got %q", stdout.String())
	}
}

// TestConfigSoftwareUpdatePollFailed covers: poll returns a failed step → error message.
func TestConfigSoftwareUpdatePollFailed(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	seq := &softwareUpdateSequence{
		responses: []string{
			softwareUpdateSettingsBody,
			softwareUpdateMutationOKBody,
			jobFailed,
		},
	}
	srv := seq.start(t)
	setupSoftwareUpdateConfig(srv)
	defer SetConfig(Config{})

	origInterval := softwareUpdatePollInterval
	softwareUpdatePollInterval = 10 * time.Millisecond
	defer func() { softwareUpdatePollInterval = origInterval }()

	cmd := ConfigSoftwareUpdateCmd()
	_ = cmd.Flags().Set("yes", "true")
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	ae := ctxWithAppEnvTyped(1, 2, 2)
	cmd.SetContext(appctx.WithAppEnv(ctxWithAppEnv(1, 2), ae))

	err := runConfigSoftwareUpdate(cmd, []string{"wordpress", "6.4"})
	if err == nil {
		t.Fatal("expected error on failed poll, got nil")
	}
	if !strings.Contains(err.Error(), "Failed during step: Apply") {
		t.Errorf("err = %q, want 'Failed during step: Apply'", err.Error())
	}
}

// TestConfigSoftwareUpdateConfirmDecline: VIP_NON_INTERACTIVE=1 + no --yes →
// Confirm returns ErrNonInteractive → the update does not happen, so the
// command must FAIL.
//
// Node throws `UserError( 'Update canceled' )` from promptForUpdate
// (src/lib/config/software.ts:335); the bin re-throws it
// (src/bin/vip-config-software-update.js:142) and command.js's
// unhandledRejection handler routes a UserError to exit.withError
// (src/lib/cli/command.js:27-28 → src/lib/cli/exit.ts `process.exit( 1 )`).
// vip-next printed "Update canceled" and returned nil, so a CI job that forgot
// --yes reported a green software update that never left the machine.
func TestConfigSoftwareUpdateConfirmDecline(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	seq := &softwareUpdateSequence{
		// SoftwareSettings is fetched for validation; mutation must NOT fire.
		responses: []string{
			softwareUpdateSettingsBody,
			`{"data":null}`,
		},
	}
	srv := seq.start(t)
	setupSoftwareUpdateConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigSoftwareUpdateCmd()
	// no --yes
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	ae := ctxWithAppEnvTyped(1, 2, 2)
	cmd.SetContext(appctx.WithAppEnv(ctxWithAppEnv(1, 2), ae))

	err := runConfigSoftwareUpdate(cmd, []string{"wordpress", "6.4"})
	if err == nil {
		t.Fatal("a declined/non-interactive confirm must fail (Node exits 1)")
	}
	if !strings.Contains(err.Error(), "Update canceled") {
		t.Errorf("err = %q, want Node's 'Update canceled'", err)
	}
	if strings.Contains(stdout.String(), "Successfully updated") {
		t.Errorf("stdout must not claim success; got %q", stdout.String())
	}
	// Mutation must NOT have fired.
	for _, b := range seq.allBodies() {
		if strings.Contains(b, "UpdateSoftwareSettings") {
			t.Errorf("mutation must NOT fire on decline; body=%s", b)
		}
	}
}

// jobNoProgress: terminal job (inProgressLock=false) that carries no progress
// object at all.
const jobNoProgress = `{"data":{"app":{"id":1,"environments":[{"id":2,"jobs":[{"__typename":"Job","type":"software_update","completedAt":"2024-01-01T00:01:00Z","createdAt":"2024-01-01T00:00:00Z","inProgressLock":false,"progress":null}]}]}}}`

// jobEmptyStatus: terminal job whose progress.status is the empty string.
const jobEmptyStatus = `{"data":{"app":{"id":1,"environments":[{"id":2,"jobs":[{"__typename":"Job","type":"software_update","completedAt":"2024-01-01T00:01:00Z","createdAt":"2024-01-01T00:00:00Z","inProgressLock":false,"progress":{"status":"","steps":[]}}]}]}}}`

// jobEmptyStatusFailedStep: no top-level status, but a step reports failure.
const jobEmptyStatusFailedStep = `{"data":{"app":{"id":1,"environments":[{"id":2,"jobs":[{"__typename":"Job","type":"software_update","completedAt":"2024-01-01T00:01:00Z","createdAt":"2024-01-01T00:00:00Z","inProgressLock":false,"progress":{"status":null,"steps":[{"step":"apply","name":"Apply","status":"failed"}]}}]}]}}}`

// Node's getUpdateResult treats a terminal job as successful ONLY when there is
// no job at all or `progress.status === 'success'`
// (src/lib/config/software.ts:398). Anything else — including a null progress
// object or an empty status string — falls through to `ok: false` and the bin
// throws it (vip-config-software-update.js:116), i.e. exit 1.
//
// vip-next short-circuited `""`/nil to success, so an update whose job never
// reported a result printed "Successfully updated …" and exited 0.
func TestConfigSoftwareUpdateEmptyJobProgressIsNotSuccess(t *testing.T) {
	cases := []struct {
		name    string
		job     string
		wantErr string
	}{
		{"nil progress", jobNoProgress, "Software update failed"},
		{"empty status", jobEmptyStatus, "Software update failed"},
		{"empty status with failed step", jobEmptyStatusFailedStep, "Failed during step: Apply"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("NO_COLOR", "1")
			seq := &softwareUpdateSequence{
				responses: []string{
					softwareUpdateSettingsBody,
					softwareUpdateMutationOKBody,
					tc.job,
				},
			}
			srv := seq.start(t)
			setupSoftwareUpdateConfig(srv)
			defer SetConfig(Config{})

			origInterval := softwareUpdatePollInterval
			softwareUpdatePollInterval = 10 * time.Millisecond
			defer func() { softwareUpdatePollInterval = origInterval }()

			cmd := ConfigSoftwareUpdateCmd()
			_ = cmd.Flags().Set("yes", "true")
			var stdout bytes.Buffer
			cmd.SetOut(&stdout)
			cmd.SetErr(&bytes.Buffer{})
			ae := ctxWithAppEnvTyped(1, 2, 2)
			cmd.SetContext(appctx.WithAppEnv(ctxWithAppEnv(1, 2), ae))

			err := runConfigSoftwareUpdate(cmd, []string{"wordpress", "6.4"})
			if err == nil {
				t.Fatal("a job that never reported success must fail (Node exits 1)")
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("err = %q, want %q", err, tc.wantErr)
			}
			if strings.Contains(stdout.String(), "Successfully updated") {
				t.Errorf("stdout must not claim success; got %q", stdout.String())
			}
		})
	}
}

// TestConfigSoftwareUpdateInvalidComponent: passing unsupported component →
// validation error, no network calls for mutation.
func TestConfigSoftwareUpdateInvalidComponent(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	seq := &softwareUpdateSequence{
		responses: []string{
			softwareUpdateSettingsBody,
			`{"data":null}`,
		},
	}
	srv := seq.start(t)
	setupSoftwareUpdateConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigSoftwareUpdateCmd()
	_ = cmd.Flags().Set("yes", "true")
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	ae := ctxWithAppEnvTyped(1, 2, 2)
	cmd.SetContext(appctx.WithAppEnv(ctxWithAppEnv(1, 2), ae))

	err := runConfigSoftwareUpdate(cmd, []string{"redis", "1.0"})
	if err == nil {
		t.Fatal("expected error for invalid component, got nil")
	}
	if !strings.Contains(err.Error(), "Component redis is not supported. Use one of: wordpress,php,muplugins") {
		t.Errorf("err = %q, want component-not-supported message", err.Error())
	}
	// Mutation must NOT have fired.
	for _, b := range seq.allBodies() {
		if strings.Contains(b, "UpdateSoftwareSettings") {
			t.Errorf("mutation must NOT fire on invalid component; body=%s", b)
		}
	}
}

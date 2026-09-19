package commands

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/Khan/genqlient/graphql"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/telemetry"
)

// graphqlMock returns a test server whose /graphql handler dispatches POST
// bodies on operationName: ResolveAppByName / ResolveAppByID -> fixed
// app+env shape; UpdateDefensiveMode{Status,Config} -> success payload.
// The second return value is a helper that reads the body of the most
// recent mutation request (under a mutex so the race detector is happy).
func graphqlMock(t *testing.T) (*httptest.Server, func() string) {
	t.Helper()
	var mu sync.Mutex
	var lastBody string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(s, `"operationName":"ResolveAppByName"`) ||
			strings.Contains(s, `"operationName":"ResolveAppByID"`):
			// Fixed fixture: app id=42 named "myapp" with two envs.
			_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"name":"myapp","environments":[{"id":7,"name":"develop","type":"develop","defaultDomain":"d.example"},{"id":1,"name":"production","type":"production","defaultDomain":"p.example"}]},"apps":{"edges":[{"id":42,"name":"myapp","environments":[{"id":7,"name":"develop","type":"develop","defaultDomain":"d.example"},{"id":1,"name":"production","type":"production","defaultDomain":"p.example"}]}]}}}`))
		case strings.Contains(s, `"operationName":"UpdateDefensiveModeStatus"`):
			mu.Lock()
			lastBody = s
			mu.Unlock()
			_, _ = w.Write([]byte(`{"data":{"updateDefensiveModeStatus":{"success":true,"message":"ok"}}}`))
		case strings.Contains(s, `"operationName":"UpdateDefensiveModeConfig"`):
			mu.Lock()
			lastBody = s
			mu.Unlock()
			_, _ = w.Write([]byte(`{"data":{"updateDefensiveModeConfig":{"success":true,"message":"ok"}}}`))
		default:
			t.Errorf("unexpected GraphQL request: %s", s)
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	return srv, func() string {
		mu.Lock()
		defer mu.Unlock()
		return lastBody
	}
}

// setupTestConfig wires SetConfig with a genqlient client pointed at srv.
// The tracker is explicitly Disabled so we never touch the real Tracks /
// Pendo endpoints during a unit test — telemetry.NewDefault() would honor
// GO_ENV=test, but we don't want to rely on a global env var being set.
func setupTestConfig(srv *httptest.Server) {
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	SetConfig(Config{
		APIHost:      srv.URL,
		Token:        "t",
		GQLClient:    c,
		Tracker:      &telemetry.Tracker{Disabled: true},
		AppCtxConfig: appctx.AppContextConfig{Client: c},
	})
}

// runDefensiveModeCmd is the test harness for the parent + subcommand
// chain. The production root command declares --app/--env/--non-interactive
// persistently; here we declare them locally on the parent because we're
// not using root.go.
func runDefensiveModeCmd(t *testing.T, args ...string) error {
	t.Helper()
	cmd := NewDefensiveModeCmd()
	cmd.PersistentFlags().String("app", "", "")
	cmd.PersistentFlags().String("env", "", "")
	cmd.PersistentFlags().Bool("non-interactive", false, "")
	cmd.SilenceUsage = true
	cmd.SilenceErrors = true
	cmd.SetArgs(args)
	return cmd.Execute()
}

func TestDefensiveModeEnableCalledCorrectly(t *testing.T) {
	srv, lastBody := graphqlMock(t)
	defer srv.Close()
	setupTestConfig(srv)

	if err := runDefensiveModeCmd(t,
		"enable", "--app=myapp", "--env=develop",
		"--skip-confirmation", "--non-interactive",
	); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	body := lastBody()
	if !strings.Contains(body, "UpdateDefensiveModeStatus") {
		t.Errorf("body missing operation: %s", body)
	}
	if !strings.Contains(body, `"enabled":true`) {
		t.Errorf("enabled should be true: %s", body)
	}
	if !strings.Contains(body, `"id":42`) || !strings.Contains(body, `"environmentId":7`) {
		t.Errorf("input ids missing (id=42, environmentId=7); body=%s", body)
	}
}

func TestDefensiveModeDisableCalledCorrectly(t *testing.T) {
	srv, lastBody := graphqlMock(t)
	defer srv.Close()
	setupTestConfig(srv)

	if err := runDefensiveModeCmd(t,
		"disable", "--app=myapp", "--env=develop",
		"--skip-confirmation", "--non-interactive",
	); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	body := lastBody()
	if !strings.Contains(body, `"enabled":false`) {
		t.Errorf("disable must send enabled:false; body=%s", body)
	}
}

func TestDefensiveModeParentCommandHasSubcommands(t *testing.T) {
	parent := NewDefensiveModeCmd()
	for _, sub := range []string{"enable", "disable", "configure"} {
		if findSub(parent, sub) == nil {
			t.Errorf("missing subcommand %q", sub)
		}
	}
}

func findSub(c *cobra.Command, name string) *cobra.Command {
	for _, sub := range c.Commands() {
		if sub.Use == name || strings.HasPrefix(sub.Use, name+" ") {
			return sub
		}
	}
	return nil
}

func TestDefensiveModeConfigureMissingRequired(t *testing.T) {
	srv, _ := graphqlMock(t)
	defer srv.Close()
	setupTestConfig(srv)
	err := runDefensiveModeCmd(t,
		"configure", "--app=myapp", "--env=develop", "--non-interactive",
	)
	if err == nil {
		t.Error("missing --enabled/--challenge-type in non-interactive mode must error")
	}
}

func TestDefensiveModeConfigureValid(t *testing.T) {
	srv, lastBody := graphqlMock(t)
	defer srv.Close()
	setupTestConfig(srv)

	if err := runDefensiveModeCmd(t,
		"configure", "--app=myapp", "--env=develop",
		"--enabled=true", "--challenge-type=2",
		"--connection-threshold-absolute=5000",
		"--connection-threshold-percentage=80",
		"--skip-confirmation", "--non-interactive",
	); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	body := lastBody()
	if !strings.Contains(body, "UpdateDefensiveModeConfig") {
		t.Errorf("operation missing: %s", body)
	}
	if !strings.Contains(body, `"challengeType":2`) {
		t.Errorf("challengeType missing: %s", body)
	}
	if !strings.Contains(body, `"connectionThresholdAbsolute":5000`) {
		t.Errorf("absolute threshold missing: %s", body)
	}
}

// ── production guard ──────────────────────────────────────────────────────
//
// All three subcommands gate on `ae.Env.Type == "production"`, and until now
// every test drove --env=develop, so the guard on the fixture's production
// environment (id 1) was never exercised at all. These tests pin both halves:
// the guard refuses without --skip-confirmation, and it does not fire on a
// non-production environment.
//
// The interactive decline branch (a TTY user answering "n") is deliberately
// NOT converted to a non-zero exit: `defensive-mode` has no Node counterpart,
// and Node's convention for a declined destructive confirm is exit 0 —
// `console.log( 'Command cancelled' ); process.exit();` in vip-wp.js:396-397
// (the closest analogue: a production-only gate on a mutating command),
// vip-config-envvar-set.js:66-67, vip-config-envvar-delete.js:61-62, and
// command.js:987-991 for every requireConfirm command. Non-interactive is the
// scriptable path and it already exits 1, which is what CI needs.

// runDefensiveModeCmdCapturing is runDefensiveModeCmd plus stdout/stderr capture.
func runDefensiveModeCmdCapturing(t *testing.T, args ...string) (string, error) {
	t.Helper()
	cmd := NewDefensiveModeCmd()
	cmd.PersistentFlags().String("app", "", "")
	cmd.PersistentFlags().String("env", "", "")
	cmd.PersistentFlags().Bool("non-interactive", false, "")
	cmd.SilenceUsage = true
	cmd.SilenceErrors = true
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetErr(&out)
	cmd.SetArgs(args)
	err := cmd.Execute()
	return out.String(), err
}

func TestDefensiveModeProductionGuardBlocksWithoutSkipConfirmation(t *testing.T) {
	cases := []struct {
		name string
		argv []string
		want string
	}{
		{"enable", []string{"enable"}, "refusing to enable defensive mode on production"},
		{"disable", []string{"disable"}, "refusing to disable defensive mode on production"},
		{
			"configure",
			[]string{"configure", "--enabled=true", "--challenge-type=2"},
			"refusing to configure defensive mode on production",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, lastBody := graphqlMock(t)
			defer srv.Close()
			setupTestConfig(srv)

			argv := append(append([]string{}, tc.argv...),
				"--app=myapp", "--env=production", "--non-interactive")
			err := runDefensiveModeCmd(t, argv...)
			if err == nil {
				t.Fatal("production without --skip-confirmation must fail")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %q, want %q", err, tc.want)
			}
			// The guard is only worth anything if the mutation never left.
			if body := lastBody(); body != "" {
				t.Errorf("a blocked production mutation was sent anyway: %s", body)
			}
		})
	}
}

func TestDefensiveModeProductionGuardPassesWithSkipConfirmation(t *testing.T) {
	cases := []struct {
		name string
		argv []string
		want string
	}{
		{"enable", []string{"enable"}, `"enabled":true`},
		{"disable", []string{"disable"}, `"enabled":false`},
		{
			"configure",
			[]string{"configure", "--enabled=true", "--challenge-type=2"},
			`"challengeType":2`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, lastBody := graphqlMock(t)
			defer srv.Close()
			setupTestConfig(srv)

			argv := append(append([]string{}, tc.argv...),
				"--app=myapp", "--env=production", "--skip-confirmation", "--non-interactive")
			if err := runDefensiveModeCmd(t, argv...); err != nil {
				t.Fatalf("Execute: %v", err)
			}
			body := lastBody()
			if !strings.Contains(body, tc.want) {
				t.Errorf("body = %s, want %q", body, tc.want)
			}
			// Production is environment id 1 in the fixture — proves the
			// mutation targeted production and not the develop default.
			if !strings.Contains(body, `"environmentId":1`) {
				t.Errorf("mutation did not target production (environmentId 1): %s", body)
			}
		})
	}
}

// The guard must not fire on a non-production environment: `enable` on develop
// with no --skip-confirmation still mutates, in a non-interactive session.
func TestDefensiveModeNonProductionNeedsNoConfirmation(t *testing.T) {
	srv, lastBody := graphqlMock(t)
	defer srv.Close()
	setupTestConfig(srv)

	out, err := runDefensiveModeCmdCapturing(t,
		"enable", "--app=myapp", "--env=develop", "--non-interactive")
	if err != nil {
		t.Fatalf("develop must not require --skip-confirmation: %v", err)
	}
	if body := lastBody(); !strings.Contains(body, `"environmentId":7`) {
		t.Errorf("mutation missing or wrong env: %s", body)
	}
	if !strings.Contains(out, "Defensive mode enabled") {
		t.Errorf("output = %q, want the success line", out)
	}
}

// A non-interactive step-up now fails fast, and the way back to the old
// behavior is --rechallenge-wait (or VIP_RECHALLENGE_WAIT=1). The flag is read
// off the raw command line by the step-up middleware, but cobra still has to
// accept it — an unknown flag is rejected before the middleware ever runs,
// which would make the documented escape hatch unusable on every one of these
// commands. Node registers it on the same three (src/bin/vip-defensive-mode-*).
func TestDefensiveModeAcceptsRechallengeWaitFlag(t *testing.T) {
	for _, sub := range []string{"enable", "disable", "configure"} {
		t.Run(sub, func(t *testing.T) {
			srv, _ := graphqlMock(t)
			defer srv.Close()
			setupTestConfig(srv)

			argv := []string{sub, "--app=myapp", "--env=develop",
				"--non-interactive", "--skip-confirmation", "--rechallenge-wait"}
			if sub == "configure" {
				argv = append(argv, "--enabled=true", "--challenge-type=1")
			}
			if err := runDefensiveModeCmd(t, argv...); err != nil {
				t.Fatalf("%s must accept --rechallenge-wait: %v", sub, err)
			}
		})
	}
}

// The success line identifies the target as <app>.<env TYPE>, matching Node's
// reportMutationResult (`${appName}.${envType}`, cli-helpers.ts:92) and every
// other vip-next command, all of which render the environment from Env.Type.
// These three printed Env.Type's sibling field, Env.Name — invisible in the
// shared fixture, where the two are equal, and wrong for any environment with
// a custom name. The fixture here deliberately makes them differ.
func TestDefensiveModeSuccessLineNamesTheEnvironmentType(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(s, `"operationName":"ResolveAppBy`):
			// name "Nightly Build" vs type "develop".
			_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"name":"myapp","environments":[{"id":7,"name":"Nightly Build","type":"develop","defaultDomain":"d.example"}]},"apps":{"edges":[{"id":42,"name":"myapp","environments":[{"id":7,"name":"Nightly Build","type":"develop","defaultDomain":"d.example"}]}]}}}`))
		default:
			_, _ = w.Write([]byte(`{"data":{"updateDefensiveModeStatus":{"success":true,"message":"ok"}}}`))
		}
	}))
	defer srv.Close()
	setupTestConfig(srv)

	// A custom-named env is addressed by its "<type>.<name>" identifier.
	out, err := runDefensiveModeCmdCapturing(t,
		"enable", "--app=myapp", "--env=develop.Nightly Build", "--non-interactive")
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if !strings.Contains(out, "myapp.develop") {
		t.Errorf("success line must identify myapp.develop; got %q", out)
	}
	if strings.Contains(out, "Nightly Build") {
		t.Errorf("success line used the environment's display name, not its type: %q", out)
	}
}

func TestDefensiveModeConfigureBadBoolean(t *testing.T) {
	srv, _ := graphqlMock(t)
	defer srv.Close()
	setupTestConfig(srv)
	err := runDefensiveModeCmd(t,
		"configure", "--app=myapp", "--env=develop",
		"--enabled=maybe", "--challenge-type=1",
		"--non-interactive", "--skip-confirmation",
	)
	if err == nil {
		t.Error("--enabled=maybe must fail")
	}
}

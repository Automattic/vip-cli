package commands

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/debuglog"
)

// These tests catch missing command diagnostics and accidental logging of
// environment values, file paths, response objects, or unrelated namespaces.
func TestConfigEnvvarDebugRequests(t *testing.T) {
	const secret = "CONFIG_SECRET_SENTINEL"
	valuePath := filepath.Join(t.TempDir(), "CONFIG_PRIVATE_PATH")
	if err := os.WriteFile(valuePath, []byte(secret), 0600); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name     string
		newCmd   func() *cobra.Command
		run      func(*cobra.Command) error
		response string
		want     string
	}{
		{"get", ConfigEnvvarGetCmd, func(c *cobra.Command) error { return runEnvvarGet(c, []string{"my_var"}) }, `{"data":{"app":{"environments":[{"environmentVariables":{"total":1,"nodes":[{"name":"MY_VAR","value":"CONFIG_SECRET_SENTINEL"}]}}]}}}`, `Get environment variable "MY_VAR"`},
		{"get-all", ConfigEnvvarGetAllCmd, func(c *cobra.Command) error { _, err := runEnvvarGetAll(c, nil); return err }, `{"data":{"app":{"environments":[{"environmentVariables":{"total":1,"nodes":[{"name":"MY_VAR","value":"CONFIG_SECRET_SENTINEL"}]}}]}}}`, "Get all environment variables"},
		{"list", ConfigEnvvarListCmd, func(c *cobra.Command) error { _, err := runEnvvarList(c, nil); return err }, `{"data":{"app":{"environments":[{"environmentVariables":{"total":1,"nodes":[{"name":"MY_VAR"}]}}]}}}`, "list environment variables"},
		{"set", ConfigEnvvarSetCmd, func(c *cobra.Command) error {
			_ = c.Flags().Set("from-file", valuePath)
			_ = c.Flags().Set("skip-confirmation", "true")
			return runEnvvarSet(c, []string{"my_var"})
		}, `{"data":{"addEnvironmentVariable":{"environmentVariables":{"total":1,"nodes":[{"name":"MY_VAR"}]}}}}`, `Set environment variable "MY_VAR"`},
		{"delete", ConfigEnvvarDeleteCmd, func(c *cobra.Command) error {
			_ = c.Flags().Set("skip-confirmation", "true")
			return runEnvvarDelete(c, []string{"my_var"})
		}, `{"data":{"deleteEnvironmentVariable":{"environmentVariables":{"total":0,"nodes":[]}}}}`, `Delete environment variable "MY_VAR"`},
	} {
		for _, selector := range []string{"@automattic/vip:bin:config:envvar", "unrelated", ""} {
			t.Run(tc.name+"/"+selector, func(t *testing.T) {
				srv := envvarStubServer(t, tc.response)
				defer srv.Close()
				setupEnvvarConfig(srv)
				defer SetConfig(Config{})
				cmd := tc.newCmd()
				var stdout, stderr bytes.Buffer
				cmd.SetOut(&stdout)
				cmd.SetErr(&stderr)
				cmd.SetContext(debuglog.WithLogger(ctxWithAppEnv(42, 7), selector, &stderr))
				if err := tc.run(cmd); err != nil {
					t.Fatal(err)
				}
				if selector == "@automattic/vip:bin:config:envvar" {
					for _, want := range []string{selector, "Request: " + tc.want, "app_id=42", "env_id=7"} {
						if !strings.Contains(stderr.String(), want) {
							t.Errorf("missing %q in diagnostics %q", want, stderr.String())
						}
					}
				} else if stderr.Len() != 0 {
					t.Errorf("unselected diagnostics: %q", stderr.String())
				}
				for _, private := range []string{secret, valuePath, srv.URL} {
					if strings.Contains(stderr.String(), private) {
						t.Errorf("private data in diagnostics: %q", stderr.String())
					}
				}
				if strings.Contains(stdout.String(), "@automattic/vip:") {
					t.Errorf("diagnostics polluted stdout: %q", stdout.String())
				}
				if tc.name == "get" && strings.TrimSpace(stdout.String()) != secret {
					t.Errorf("get stdout changed: %q", stdout.String())
				}
			})
		}
	}
}

func TestConfigSoftwareDebugSummaries(t *testing.T) {
	const namespace = "@automattic/vip:bin:config-software"
	for _, tc := range []struct {
		name      string
		responses []string
		want      []string
		wantError bool
	}{
		{"success", []string{softwareUpdateSettingsBody, softwareUpdateMutationOKBody, jobInProgress, jobSuccess}, []string{"Triggering update", "component=wordpress", "app_id=1", "env_id=2", "Triggered update with result: success", "Getting update result", "Latest job result: present=true in_progress=true", "Sleep for", "Latest job result: present=true in_progress=false"}, false},
		{"no-job", []string{softwareUpdateSettingsBody, softwareUpdateMutationOKBody, `{"data":{"app":{"environments":[{"jobs":[]}]}}}`}, []string{"Latest job result: present=false"}, false},
		{"failure", []string{softwareUpdateSettingsBody, `{"errors":[{"message":"CONFIG_SECRET_SENTINEL https://private.invalid/secret"}]}`}, []string{"Triggering update"}, true},
		{"failed-job", []string{softwareUpdateSettingsBody, softwareUpdateMutationOKBody, strings.ReplaceAll(jobFailed, "Apply", "CONFIG_SECRET_SENTINEL")}, []string{"Latest job result: present=true in_progress=false"}, true},
	} {
		for _, selector := range []string{namespace, "unrelated", ""} {
			t.Run(tc.name+"/"+selector, func(t *testing.T) {
				seq := &softwareUpdateSequence{responses: tc.responses}
				srv := seq.start(t)
				setupSoftwareUpdateConfig(srv)
				defer SetConfig(Config{})
				oldInterval := softwareUpdatePollInterval
				softwareUpdatePollInterval = time.Millisecond
				defer func() { softwareUpdatePollInterval = oldInterval }()
				cmd := ConfigSoftwareUpdateCmd()
				_ = cmd.Flags().Set("yes", "true")
				var stdout, stderr bytes.Buffer
				cmd.SetOut(&stdout)
				cmd.SetErr(&stderr)
				ctx := appctx.WithAppEnv(ctxWithAppEnv(1, 2), ctxWithAppEnvTyped(1, 2, 2))
				cmd.SetContext(debuglog.WithLogger(ctx, selector, &stderr))
				err := runConfigSoftwareUpdate(cmd, []string{"wordpress", "6.4"})
				if (err != nil) != tc.wantError {
					t.Fatalf("unexpected error: %v", err)
				}
				if selector == namespace {
					for _, want := range append([]string{namespace}, tc.want...) {
						if !strings.Contains(stderr.String(), want) {
							t.Errorf("missing %q in diagnostics %q", want, stderr.String())
						}
					}
				} else if stderr.Len() != 0 {
					t.Errorf("unselected diagnostics: %q", stderr.String())
				}
				for _, private := range []string{"CONFIG_SECRET_SENTINEL", "https://", srv.URL, "{", "}"} {
					if strings.Contains(stderr.String(), private) {
						t.Errorf("raw response data in diagnostics: %q", stderr.String())
					}
				}
				if strings.Contains(stdout.String(), namespace) {
					t.Errorf("diagnostics polluted stdout: %q", stdout.String())
				}
			})
		}
	}
}

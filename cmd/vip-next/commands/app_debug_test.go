package commands

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestAppDeployDebugPhases(t *testing.T) {
	for _, selector := range []string{"", "@automattic/vip:bin:vip-app-deploy", "@automattic/vip:bin:vip-app-deploy-validate"} {
		t.Run(selector, func(t *testing.T) {
			for _, key := range []string{"VIP_PROXY", "vip_proxy", "VIP_USE_SYSTEM_PROXY", "vip_use_system_proxy"} {
				t.Setenv(key, "")
			}
			stub := &deployStub{}
			out := newDeployCmd(stub, t)
			t.Setenv("WPVIP_DEPLOY_TOKEN", "private-deploy-token")
			t.Setenv("DO_NOT_TRACK", "1")
			var diagnostics bytes.Buffer
			cmd := AppDeployCmd()
			cmd.SetOut(out)
			cmd.SetErr(&diagnostics)
			cmd.SetContext(debuglog.WithLogger(context.Background(), selector, &diagnostics))
			_ = cmd.Flags().Set("app", "private-app")
			_ = cmd.Flags().Set("env", "private-env")
			_ = cmd.Flags().Set("message", "private-release-description")
			_ = cmd.Flags().Set("skip-confirmation", "true")
			archive := deployArchive(t, "private-archive.tar.gz")
			if err := runAppDeploy(cmd, []string{archive}); err != nil {
				t.Fatal(err)
			}
			want := ""
			if selector == "@automattic/vip:bin:vip-app-deploy" {
				want = "@automattic/vip:bin:vip-app-deploy Validating custom deploy key...\n" +
					"@automattic/vip:bin:vip-app-deploy Validating file...\n" +
					"@automattic/vip:bin:vip-app-deploy Upload complete. Initiating the deploy.\n"
			}
			if diagnostics.String() != want {
				t.Errorf("diagnostics = %q, want %q", diagnostics.String(), want)
			}
			if strings.Contains(out.String(), "Validating") || strings.Contains(out.String(), "Initiating") {
				t.Errorf("diagnostics leaked to stdout: %q", out.String())
			}
		})
	}
}

func TestAppDeployDebugMissingKeyStopsBeforeValidation(t *testing.T) {
	t.Setenv("WPVIP_DEPLOY_TOKEN", "")
	var diagnostics bytes.Buffer
	cmd := AppDeployCmd()
	cmd.SetContext(debuglog.WithLogger(context.Background(), "@automattic/vip:bin:vip-app-deploy", &diagnostics))
	err := runAppDeploy(cmd, []string{deployArchive(t, "archive.tar.gz")})
	if err == nil || err.Error() != "Valid custom deploy key is required." {
		t.Fatalf("error = %v", err)
	}
	if got, want := diagnostics.String(), "@automattic/vip:bin:vip-app-deploy Validating custom deploy key...\n"; got != want {
		t.Errorf("diagnostics = %q, want %q", got, want)
	}
}

func TestAppDeployValidateDebug(t *testing.T) {
	for _, selector := range []string{"", "@automattic/vip:bin:vip-app-deploy-validate", "@automattic/vip:bin:vip-app-deploy"} {
		t.Run(selector, func(t *testing.T) {
			t.Setenv("DO_NOT_TRACK", "1")
			var out, diagnostics bytes.Buffer
			cmd := AppDeployValidateCmd()
			cmd.SetOut(&out)
			cmd.SetErr(&diagnostics)
			cmd.SetContext(debuglog.WithLogger(context.Background(), selector, &diagnostics))
			if err := runAppDeployValidate(cmd, []string{deployArchive(t, "private-archive.tar.gz")}); err != nil {
				t.Fatal(err)
			}
			want := ""
			if selector == "@automattic/vip:bin:vip-app-deploy-validate" {
				want = "@automattic/vip:bin:vip-app-deploy-validate Validating file...\n"
			}
			if diagnostics.String() != want {
				t.Errorf("diagnostics = %q, want %q", diagnostics.String(), want)
			}
			if strings.Contains(out.String(), "Validating file") {
				t.Errorf("diagnostics leaked to stdout: %q", out.String())
			}
		})
	}
}

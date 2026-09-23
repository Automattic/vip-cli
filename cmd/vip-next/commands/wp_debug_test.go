package commands

import (
	"bytes"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestWPSSHAuthenticationDiagnosticsExcludeCommand(t *testing.T) {
	stub := &wpStub{body: wpEnvInfoBodyWithStrategy(2, "ssh", "develop"), triggerBody: `{"data":null,"errors":[{"message":"secret-api-error"}]}`}
	setupWPTest(t, stub)
	cmd := WPCmd()
	var stdout, diagnostics bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&diagnostics)
	cmd.SetContext(debuglog.WithLogger(wpCtx(42, 7, 2, "develop"), "@automattic/vip:wp/ssh", &diagnostics))
	err := runWP(cmd, []string{"user", "update", "secret-user", "--user_pass=secret-password", "--debug"})
	if err == nil {
		t.Fatal("expected trigger error")
	}
	if !strings.Contains(diagnostics.String(), "Requesting SSH authentication") {
		t.Fatalf("missing stage: %q", diagnostics.String())
	}
	if strings.Contains(diagnostics.String(), "secret-") || strings.Contains(diagnostics.String(), "--debug") {
		t.Fatalf("private command or API data in diagnostics: %q", diagnostics.String())
	}
	if !strings.Contains(stdout.String(), "secret-api-error") {
		t.Fatal("existing error output changed")
	}
}

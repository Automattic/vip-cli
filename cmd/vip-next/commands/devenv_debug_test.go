package commands

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestDevEnvEnvvarDebugDoesNotLeakValue(t *testing.T) {
	seedEnvvarEnv(t)
	for _, ns := range []string{"@automattic/vip:bin:config:envvar", "@automattic/vip:bin:dev-environment"} {
		var out, diagnostic bytes.Buffer
		cmd := newDevEnvEnvvarCmd()
		cmd.SetOut(&out)
		cmd.SetErr(&out)
		cmd.SetContext(debuglog.WithLogger(context.Background(), ns, &diagnostic))
		cmd.SetArgs([]string{"set", "PASSWORD", "secret-env-value", "--slug", "only-one"})
		if err := cmd.Execute(); err != nil {
			t.Fatal(err)
		}
		if ns == "@automattic/vip:bin:config:envvar" && (!strings.Contains(diagnostic.String(), "set") || !strings.Contains(diagnostic.String(), "PASSWORD")) {
			t.Fatalf("missing envvar diagnostic: %s", &diagnostic)
		}
		if strings.Contains(diagnostic.String(), "secret-env-value") {
			t.Fatalf("secret in diagnostics: %s", &diagnostic)
		}
		if strings.Contains(out.String(), "@automattic") {
			t.Fatalf("debug contaminated stdout: %s", &out)
		}
	}
}

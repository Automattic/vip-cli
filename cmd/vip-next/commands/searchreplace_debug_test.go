package commands

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestSearchReplaceDiagnosticsKeepSQLOutputSeparate(t *testing.T) {
	const namespace = "@automattic/vip:lib:search-and-replace"
	for _, tc := range []struct {
		name, selector      string
		fileOutput, enabled bool
	}{
		{name: "disabled"},
		{name: "library stdout", selector: namespace, enabled: true},
		{name: "library file", selector: namespace, fileOutput: true, enabled: true},
		{name: "wildcard", selector: "@automattic/vip:*", enabled: true},
		{name: "excluded", selector: "*,-" + namespace},
		{name: "unsafe bin omitted", selector: "@automattic/vip:bin:vip-search-replace"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("VIP_SEARCH_REPLACE_BIN", fakeSearchReplaceBinary(t))
			dir := t.TempDir()
			input := filepath.Join(dir, "sensitive-input.sql")
			output := filepath.Join(dir, "sensitive-output.sql")
			if err := os.WriteFile(input, []byte("private_sql_payload\n"), 0o600); err != nil {
				t.Fatal(err)
			}
			var stdout, diagnostics bytes.Buffer
			cmd := SearchReplaceCmd()
			cmd.SetOut(&stdout)
			cmd.SetErr(&diagnostics)
			cmd.SetContext(debuglog.WithLogger(context.Background(), tc.selector, &diagnostics))
			args := []string{input, "--search-replace=https://private-user:private-password@example.test,private-replacement"}
			if tc.fileOutput {
				args = append(args, "--output="+output)
			}
			cmd.SetArgs(args)
			if err := cmd.Execute(); err != nil {
				t.Fatal(err)
			}
			if tc.fileOutput {
				got, err := os.ReadFile(output)
				if err != nil || string(got) != "PRIVATE_SQL_PAYLOAD\n" || stdout.Len() != 0 {
					t.Fatalf("file output=%q stdout=%q err=%v", got, stdout.String(), err)
				}
			} else if stdout.String() != "PRIVATE_SQL_PAYLOAD\n" {
				t.Fatalf("SQL stdout contaminated: %q", stdout.String())
			}
			log := diagnostics.String()
			if !tc.enabled {
				if log != "" {
					t.Fatalf("unexpected diagnostics: %q", log)
				}
				return
			}
			for _, want := range []string{namespace, "input=file", "stage=completed"} {
				if !strings.Contains(log, want) {
					t.Errorf("missing %q in %q", want, log)
				}
			}
			route := "output=stdout"
			if tc.fileOutput {
				route = "output=file"
			}
			if !strings.Contains(log, route) {
				t.Errorf("missing route %q in %q", route, log)
			}
			for _, secret := range []string{dir, "sensitive-input", "sensitive-output", "private-user", "private-password", "private-replacement", "example.test", "private_sql_payload", "PRIVATE_SQL_PAYLOAD", "--search-replace"} {
				if strings.Contains(log, secret) {
					t.Errorf("diagnostics expose %q: %q", secret, log)
				}
			}
		})
	}
}

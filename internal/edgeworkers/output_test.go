package edgeworkers

import (
	"bytes"
	json "encoding/json/v2"
	"errors"
	"github.com/Automattic/vip/internal/output"
	"strings"
	"testing"
)

func TestListJSONPreservesControlValues(t *testing.T) {
	var buf bytes.Buffer
	name := "headers\x1b\n\u009b"
	if err := output.Render(&buf, output.Format("json"), ListRows([]Worker{{Name: name}}, "json")); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buf.String(), `headers\u001b\n\u009b`) {
		t.Fatalf("JSON bytes: %q", buf.String())
	}
	var rows []map[string]any
	if err := json.Unmarshal(buf.Bytes(), &rows); err != nil || rows[0]["name"] != name {
		t.Fatalf("JSON value: %v %v", rows, err)
	}
}

func TestDetailSourcePreservesFormatting(t *testing.T) {
	for _, tc := range []struct{ name, source, want string }{
		{"newlines and tabs", "// café\n\nexport function run(): void {\n\treturn;\n}\n", "// café\n\nexport function run(): void {\n\treturn;\n}\n"},
		{"Windows line endings", "export {};\r\n\t// comment\r\n", "export {};\n\t// comment\n"},
		{"terminal controls", "\x00\a\b\v\f\r\x1b[2J\x7f\u0085\u009b31m", `\u0000\u0007\u0008\u000b\u000c\u000d\u001b[2J\u007f\u0085\u009b31m`},
		{"literal escape sequences", `// literal \u000a and \t`, `// literal \u000a and \t`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			text := DetailText(Worker{Name: "headers\n\tforged", Source: &tc.source}, true)
			metadata, source, found := strings.Cut(text, "\n\nSource:\n")
			if !found || source != tc.want {
				t.Fatalf("source = %q, want %q", source, tc.want)
			}
			if !strings.Contains(metadata, `+ Name: headers\u000a\u0009forged`) {
				t.Fatalf("metadata escaping changed: %q", metadata)
			}
		})
	}
}

func TestOutputAndConfirmation(t *testing.T) {
	if got := EscapeTerminalText("a\n\x1b\x7f\u009b"); got != `a\u000a\u001b\u007f\u009b` {
		t.Fatalf("escaped %q", got)
	}
	for _, env := range []string{"develop", "production"} {
		for _, skip := range []bool{false, true} {
			for _, nonInteractive := range []bool{false, true} {
				calls := 0
				req := ProductionConfirmation{Action: "deploy", AppName: "app\n", EnvType: env, WorkerNames: []string{"a", "b"}, EnableAfterDeploy: true, SkipConfirmation: skip, NonInteractive: nonInteractive}
				err := ConfirmProduction(req, func(message string) (bool, error) {
					calls++
					if message != `Deploy and enable 2 edge workers (a, b) on app\u000a.production?` {
						t.Fatalf("prompt %s", message)
					}
					return true, nil
				})
				needs := env == "production" && !skip
				if needs && nonInteractive {
					if err == nil || !strings.Contains(err.Error(), "--skip-confirmation") {
						t.Fatalf("refusal %v", err)
					}
				} else if err != nil {
					t.Fatal(err)
				}
				if calls != btoi(needs && !nonInteractive) {
					t.Fatalf("prompts %d", calls)
				}
			}
		}
	}
	err := ConfirmProduction(ProductionConfirmation{EnvType: "production", Action: "enable", WorkerNames: []string{"a"}}, func(string) (bool, error) { return false, nil })
	if err == nil || err.Error() != "Command cancelled by user." {
		t.Fatalf("cancel %v", err)
	}
	if err := ConfirmDeletion("app", "develop", "a", false, func(string) (bool, error) { return false, nil }); err == nil {
		t.Fatal("deletion not cancelled")
	}
	if err := ConfirmDeletion("app", "production", "a", true, func(string) (bool, error) { t.Fatal("prompted despite force"); return false, nil }); err != nil {
		t.Fatal(err)
	}
	active := false
	msg := PartialFailureMessage(&ApplyError{FailedName: "a", Stage: "enable", UploadCompleted: true, ActiveAfterUpload: &active, Cause: errors.New("bad\nerror"), UnappliedNames: []string{"b"}})
	if !strings.Contains(msg, "Final active state is unknown") || !strings.Contains(msg, `Cause: bad\u000aerror`) {
		t.Fatal(msg)
	}
}
func btoi(b bool) int {
	if b {
		return 1
	}
	return 0
}

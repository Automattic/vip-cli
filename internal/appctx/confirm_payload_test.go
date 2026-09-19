package appctx

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/output"
)

// stubConfirm replaces the survey-backed prompt so tests can observe the
// message that would have been shown and choose the answer. Returns a
// restore func.
func stubConfirm(t *testing.T, answer bool, seen *string) {
	t.Helper()
	prev := confirmPrompt
	confirmPrompt = func(_ *cobra.Command, message string, _ bool) (bool, error) {
		if seen != nil {
			*seen = message
		}
		return answer, nil
	}
	t.Cleanup(func() { confirmPrompt = prev })
}

func requireConfirmCmd(t *testing.T, ae *AppEnv) (*cobra.Command, *bytes.Buffer) {
	t.Helper()
	t.Setenv("NO_COLOR", "1")
	cmd := &cobra.Command{Use: "x"}
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	if ae != nil {
		cmd.SetContext(WithAppEnv(context.Background(), ae))
	} else {
		cmd.SetContext(context.Background())
	}
	return cmd, &stdout
}

// Node's requireConfirm builds an info table and confirm() console.logs it
// ABOVE the yes/no prompt (command.js:840-851 + prompt.ts:14). vip-next
// printed only the message, so users authorized destructive actions without
// being told which app/environment they targeted.
func TestWithRequireConfirmRendersAppAndEnvironmentRows(t *testing.T) {
	cmd, stdout := requireConfirmCmd(t, &AppEnv{
		App: App{ID: 42, Name: "my-app"},
		Env: Env{ID: 7, AppId: 7, Type: "develop", Name: "develop"},
	})
	stubConfirm(t, true, nil)

	mw := WithRequireConfirm(cmd, "Are you sure you want to sync from production?")
	called := false
	if err := mw(func(*cobra.Command, []string) error { called = true; return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !called {
		t.Fatal("handler must run after a yes")
	}

	want := "===================================\n" +
		"+ App: my-app (id: 42)\n" +
		"+ Environment: develop (id: 7)\n" +
		"===================================\n"
	if stdout.String() != want {
		t.Errorf("info table mismatch\n got: %q\nwant: %q", stdout.String(), want)
	}
}

// getEnvIdentifier disambiguates sibling envs of the same type, so a
// non-main env renders as "type.name".
func TestWithRequireConfirmEnvironmentRowUsesEnvIdentifier(t *testing.T) {
	cmd, stdout := requireConfirmCmd(t, &AppEnv{
		App: App{ID: 42, Name: "my-app"},
		Env: Env{ID: 9, AppId: 7, Type: "develop", Name: "second"},
	})
	stubConfirm(t, true, nil)

	mw := WithRequireConfirm(cmd, "Are you sure?")
	if err := mw(func(*cobra.Command, []string) error { return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !strings.Contains(stdout.String(), "+ Environment: develop.second (id: 9)\n") {
		t.Errorf("want Environment row using getEnvIdentifier; got %q", stdout.String())
	}
}

// Node's whole requireConfirm block — including the console.log of the
// info table — is inside `if (_opts.requireConfirm && ! options.force)`.
// --force / --skip-confirmation therefore prints NOTHING.
func TestWithRequireConfirmSkipFlagPrintsNoInfoTable(t *testing.T) {
	cmd, stdout := requireConfirmCmd(t, &AppEnv{
		App: App{ID: 42, Name: "my-app"},
		Env: Env{ID: 7, AppId: 7, Type: "develop", Name: "develop"},
	})
	mw := WithRequireConfirm(cmd, "Are you sure?")
	_ = cmd.Flags().Set("skip-confirmation", "true")
	if err := mw(func(*cobra.Command, []string) error { return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if stdout.Len() != 0 {
		t.Errorf("--skip-confirmation must print nothing; got %q", stdout.String())
	}
}

// The module rows (command.js:858-983) are appended AFTER App/Environment.
func TestWithRequireConfirmAppendsModulePayloadRows(t *testing.T) {
	cmd, stdout := requireConfirmCmd(t, &AppEnv{
		App: App{ID: 1, Name: "app"},
		Env: Env{ID: 2, AppId: 2, Type: "production", Name: "production"},
	})
	stubConfirm(t, true, nil)

	payload := func(*cobra.Command, []string, string) ([]output.Tuple, string, error) {
		return []output.Tuple{{Key: "From backup", Value: "Mon, 21 Jul 2025 10:11:12 GMT"}}, "Are you sure?", nil
	}
	mw := WithRequireConfirm(cmd, "Are you sure?", payload)
	if err := mw(func(*cobra.Command, []string) error { return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	want := "===================================\n" +
		"+ App: app (id: 1)\n" +
		"+ Environment: production (id: 2)\n" +
		"+ From backup: Mon, 21 Jul 2025 10:11:12 GMT\n" +
		"===================================\n"
	if stdout.String() != want {
		t.Errorf("info table mismatch\n got: %q\nwant: %q", stdout.String(), want)
	}
}

// The sync module's canSync guard exits BEFORE the prompt and before the
// destructive mutation. A payload error must abort the whole chain and must
// not render a table or invoke the handler.
func TestWithRequireConfirmPayloadErrorAbortsBeforeHandler(t *testing.T) {
	cmd, stdout := requireConfirmCmd(t, &AppEnv{App: App{ID: 1, Name: "app"}})
	stubConfirm(t, true, nil)

	boom := errors.New("Could not sync to this environment: nope")
	payload := func(*cobra.Command, []string, string) ([]output.Tuple, string, error) {
		return nil, "", boom
	}
	called := false
	mw := WithRequireConfirm(cmd, "Are you sure?", payload)
	err := mw(func(*cobra.Command, []string) error { called = true; return nil })(cmd, nil)
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want %v", err, boom)
	}
	if called {
		t.Error("handler must not run when the payload refuses")
	}
	if stdout.Len() != 0 {
		t.Errorf("no info table should be printed on refusal; got %q", stdout.String())
	}
}

// import-media rewrites "the URL" -> "the path" for local archives
// (command.js:944-947), so a payload must be able to replace the message.
func TestWithRequireConfirmPayloadCanRewriteMessage(t *testing.T) {
	cmd, _ := requireConfirmCmd(t, &AppEnv{App: App{ID: 1, Name: "app"}})
	var seen string
	stubConfirm(t, true, &seen)

	payload := func(_ *cobra.Command, _ []string, message string) ([]output.Tuple, string, error) {
		return nil, strings.ReplaceAll(message, "the URL", "the path"), nil
	}
	mw := WithRequireConfirm(cmd, "Are you sure you want to import the contents of the URL?", payload)
	if err := mw(func(*cobra.Command, []string) error { return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if seen != "Are you sure you want to import the contents of the path?" {
		t.Errorf("prompt message = %q", seen)
	}
}

// A declined prompt still leaves the table on screen (Node prints it first)
// and cancels with exit 0.
func TestWithRequireConfirmDeclineStillRendersTable(t *testing.T) {
	cmd, stdout := requireConfirmCmd(t, &AppEnv{
		App: App{ID: 42, Name: "my-app"},
		Env: Env{ID: 7, AppId: 7, Type: "develop", Name: "develop"},
	})
	stubConfirm(t, false, nil)

	called := false
	mw := WithRequireConfirm(cmd, "Are you sure?")
	if err := mw(func(*cobra.Command, []string) error { called = true; return nil })(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if called {
		t.Error("handler must not run after a no")
	}
	if !strings.Contains(stdout.String(), "+ App: my-app (id: 42)") {
		t.Errorf("table must be printed before the prompt; got %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "Command cancelled") {
		t.Errorf("want 'Command cancelled'; got %q", stdout.String())
	}
}

package commands

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
)

// mediaConfirmServer resolves app 42 with a single "production" environment
// and 404s everything else, so any request past the confirm gate is visible.
func mediaConfirmServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(string(body), `"operationName":"ResolveAppByID"`) {
			_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"name":"my-app","type":"WordPress","typeId":2,
				"environments":[{"id":3,"appId":3,"name":"production","type":"production",
					"uniqueLabel":"production","defaultDomain":"example.com","isMultisite":false}]}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":null}`))
	}))
}

func mediaConfirmCmd(t *testing.T, srv *httptest.Server) (*cobra.Command, *bytes.Buffer) {
	t.Helper()
	t.Setenv("NO_COLOR", "1")
	client := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	SetConfig(Config{GQLClient: client, AppCtxConfig: appctx.AppContextConfig{Client: client}})
	t.Cleanup(func() { SetConfig(Config{}) })

	cmd := ImportMediaCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	_ = cmd.Flags().Set("app", "42")
	cmd.SetContext(context.Background())
	return cmd, &stdout
}

// command.js:936-980. Defaults: every toggle off ("x No"), the error-log
// choice negotiated to "prompt", and the archive row labelled "Archive URL"
// for an http(s) input.
func TestImportMediaConfirmRendersURLPayload(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	srv := mediaConfirmServer(t)
	defer srv.Close()
	cmd, stdout := mediaConfirmCmd(t, srv)

	if err := cmd.RunE(cmd, []string{"https://example.com/media.tar.gz"}); err != nil {
		t.Fatalf("RunE: %v", err)
	}
	want := "===================================\n" +
		"+ App: my-app (id: 42)\n" +
		"+ Environment: production (id: 3)\n" +
		"+ Archive URL: https://example.com/media.tar.gz\n" +
		"+ Overwrite any existing files: x No\n" +
		"+ Import intermediate image files: x No\n" +
		"+ Export any file errors encountered to a JSON file instead of a plain text file.: x No\n" +
		"+ Download file-error logs?: prompt\n" +
		"===================================\n" +
		"Command cancelled\n"
	if stdout.String() != want {
		t.Errorf("confirm payload mismatch\n got: %q\nwant: %q", stdout.String(), want)
	}
}

// A local archive gets the "Archive Path" label instead.
func TestImportMediaConfirmRendersLocalArchivePathLabel(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	srv := mediaConfirmServer(t)
	defer srv.Close()
	cmd, stdout := mediaConfirmCmd(t, srv)

	archive := filepath.Join(t.TempDir(), "media.tar.gz")
	if err := os.WriteFile(archive, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := cmd.RunE(cmd, []string{archive}); err != nil {
		t.Fatalf("RunE: %v", err)
	}
	if !strings.Contains(stdout.String(), "+ Archive Path: "+archive+"\n") {
		t.Errorf("want an 'Archive Path' row for a local archive; got %q", stdout.String())
	}
	if strings.Contains(stdout.String(), "Archive URL") {
		t.Errorf("local archive must not be labelled 'Archive URL'; got %q", stdout.String())
	}
}

// Flags on -> "✅ Yes", and --saveErrorLog is negotiated to the literal
// "true"/"false"/"prompt" trio before it is displayed (command.js:829-837).
func TestImportMediaConfirmRendersEnabledToggles(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	srv := mediaConfirmServer(t)
	defer srv.Close()
	cmd, stdout := mediaConfirmCmd(t, srv)
	_ = cmd.Flags().Set("overwriteExistingFiles", "true")
	_ = cmd.Flags().Set("importIntermediateImages", "true")
	_ = cmd.Flags().Set("exportFileErrorsToJson", "true")
	_ = cmd.Flags().Set("saveErrorLog", "yes")

	if err := cmd.RunE(cmd, []string{"https://example.com/media.zip"}); err != nil {
		t.Fatalf("RunE: %v", err)
	}
	want := "===================================\n" +
		"+ App: my-app (id: 42)\n" +
		"+ Environment: production (id: 3)\n" +
		"+ Archive URL: https://example.com/media.zip\n" +
		"+ Overwrite any existing files: ✅ Yes\n" +
		"+ Import intermediate image files: ✅ Yes\n" +
		"+ Export any file errors encountered to a JSON file instead of a plain text file.: ✅ Yes\n" +
		"+ Download file-error logs?: true\n" +
		"===================================\n" +
		"Command cancelled\n"
	if stdout.String() != want {
		t.Errorf("confirm payload mismatch\n got: %q\nwant: %q", stdout.String(), want)
	}
}

// command.js:944-947 — for a local archive the confirm message's "the URL"
// becomes "the path". vip-next always said "the URL".
func TestImportMediaConfirmRewritesURLToPathForLocalArchive(t *testing.T) {
	cmd := &cobra.Command{Use: "media"}
	cmd.Flags().Bool("exportFileErrorsToJson", false, "")
	cmd.Flags().String("saveErrorLog", "", "")
	cmd.Flags().Bool("overwriteExistingFiles", false, "")
	cmd.Flags().Bool("importIntermediateImages", false, "")
	cmd.SetContext(context.Background())

	const msg = "Are you sure you want to import the contents of the URL?"

	_, urlMessage, err := importMediaConfirmPayload(cmd, []string{"https://example.com/a.zip"}, msg)
	if err != nil {
		t.Fatalf("payload: %v", err)
	}
	if urlMessage != msg {
		t.Errorf("remote archive message = %q, want it unchanged", urlMessage)
	}

	_, pathMessage, err := importMediaConfirmPayload(cmd, []string{"/tmp/a.zip"}, msg)
	if err != nil {
		t.Fatalf("payload: %v", err)
	}
	if pathMessage != "Are you sure you want to import the contents of the path?" {
		t.Errorf("local archive message = %q", pathMessage)
	}
}

// negotiateSaveErrorLog ports the flag negotiation at command.js:829-837.
func TestNegotiateSaveErrorLog(t *testing.T) {
	cases := map[string]string{
		"":       "prompt",
		"true":   "true",
		"yes":    "yes" + "", // placeholder replaced below
		"false":  "false",
		"no":     "false",
		"banana": "prompt",
		"prompt": "prompt",
	}
	cases["yes"] = "true"
	for in, want := range cases {
		if got := negotiateSaveErrorLog(in); got != want {
			t.Errorf("negotiateSaveErrorLog(%q) = %q, want %q", in, got, want)
		}
	}
}

// `import media abort` sets no `module` in Node, so it renders App and
// Environment only — no archive/toggle rows.
func TestImportMediaAbortConfirmRendersAppEnvOnly(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	srv := mediaConfirmServer(t)
	defer srv.Close()
	t.Setenv("NO_COLOR", "1")
	client := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	SetConfig(Config{GQLClient: client, AppCtxConfig: appctx.AppContextConfig{Client: client}})
	defer SetConfig(Config{})

	cmd := ImportMediaAbortCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	_ = cmd.Flags().Set("app", "42")
	cmd.SetContext(context.Background())

	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("RunE: %v", err)
	}
	want := "===================================\n" +
		"+ App: my-app (id: 42)\n" +
		"+ Environment: production (id: 3)\n" +
		"===================================\n" +
		"Command cancelled\n"
	if stdout.String() != want {
		t.Errorf("abort confirm payload mismatch\n got: %q\nwant: %q", stdout.String(), want)
	}
}

// The negotiated saveErrorLog value must reach the handler, not just the
// info table: Node turns an absent --saveErrorLog into "prompt", so a
// completed import with a file-errors report ASKS whether to download it.
// vip-next left the flag at "" and silently skipped the question.
func TestImportMediaDefaultSaveErrorLogPrompts(t *testing.T) {
	stub := &mediaStub{}
	srv := stub.start(t)
	stub.mu.Lock()
	stub.progressBodies = []string{mediaProgress("COMPLETED", 8, 10,
		`,"failureDetails":{"previousStatus":null,"globalErrors":[],"fileErrorsUrl":"`+srv.URL+`/file-errors"}`)}
	stub.mu.Unlock()
	SetConfig(Config{
		GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()),
		APIHost:   srv.URL, Token: "tok",
	})
	defer SetConfig(Config{})
	t.Setenv("NO_COLOR", "1")
	t.Setenv("VIP_IMPORT_MEDIA_INTERVAL_MS", "1")

	prompted := false
	prev := importConfirmPrompt
	importConfirmPrompt = func(*cobra.Command, string, bool) (bool, error) {
		prompted = true
		return false, nil
	}
	defer func() { importConfirmPrompt = prev }()

	cmd := ImportMediaCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtxWithType(42, 7, "WordPress"))

	if err := runImportMedia(cmd, []string{"https://example.com/up.zip"}); err != nil {
		t.Fatalf("runImportMedia: %v", err)
	}
	if !prompted {
		t.Error("an absent --saveErrorLog must negotiate to \"prompt\" and ask before skipping the report")
	}
}

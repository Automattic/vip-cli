package commands

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type alreadyPrintedError interface {
	AlreadyPrinted() bool
}

func requireAlreadyPrintedError(t *testing.T, err error) {
	t.Helper()
	var marked alreadyPrintedError
	if !errors.As(err, &marked) || !marked.AlreadyPrinted() {
		t.Fatalf("error printed on stdout must be marked to suppress the shared stderr renderer; got %T: %v", err, err)
	}
}

// envvarMutationStub records the most recent body so set/delete tests can
// assert wire-level shape (operationName, name, value, etc.).
type envvarMutationStub struct {
	mu       sync.Mutex
	lastBody string
	respBody string
}

func (s *envvarMutationStub) start(_ *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s.mu.Lock()
		s.lastBody = string(body)
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if s.respBody == "" {
			_, _ = w.Write([]byte(`{"data":null}`))
			return
		}
		_, _ = w.Write([]byte(s.respBody))
	}))
}

func (s *envvarMutationStub) body() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastBody
}

func TestEnvvarSetFromFileNonProd(t *testing.T) {
	stub := &envvarMutationStub{
		respBody: `{"data":{"addEnvironmentVariable":{"environmentVariables":{"total":1,"nodes":[{"name":"MY_VAR"}]}}}}`,
	}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	// Write the value to a tmp file.
	dir := t.TempDir()
	valuePath := filepath.Join(dir, "value.txt")
	if err := os.WriteFile(valuePath, []byte("hello\n"), 0600); err != nil {
		t.Fatalf("write tmp value: %v", err)
	}

	cmd := ConfigEnvvarSetCmd()
	_ = cmd.Flags().Set("from-file", valuePath)
	_ = cmd.Flags().Set("skip-confirmation", "true")
	var stdout, stderr bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stderr)
	cmd.SetContext(ctxWithAppEnv(42, 7))

	if err := runEnvvarSet(cmd, []string{"my_var"}); err != nil {
		t.Fatalf("runEnvvarSet: %v", err)
	}

	out := stdout.String()
	// Node parity: name is uppercased before being printed; quoted via %s with literal "".
	if !strings.Contains(out, `Successfully set environment variable "MY_VAR"`) {
		t.Errorf("stdout = %q, want success message with uppercased quoted name", out)
	}
	body := stub.body()
	if !strings.Contains(body, `"operationName":"AddEnvironmentVariable"`) {
		t.Errorf("expected AddEnvironmentVariable op; body=%s", body)
	}
	// Value trimmed of trailing newline.
	if !strings.Contains(body, `"value":"hello"`) {
		t.Errorf("expected trimmed value=hello; body=%s", body)
	}
	if !strings.Contains(body, `"name":"MY_VAR"`) {
		t.Errorf("expected uppercased name=MY_VAR; body=%s", body)
	}
}

func TestEnvvarSetBlocksNewRelicKey(t *testing.T) {
	// Server should NOT be hit for this case — the block check fires before
	// any mutation. Use a server that fails the test if called.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		// ResolveApp may be called by the middleware in production, but in
		// these unit tests we bypass middleware and pre-populate ctx — so a
		// hit here is unexpected and worth surfacing.
		t.Errorf("unexpected request to mock server: %s", body)
		_, _ = w.Write([]byte(`{"data":null}`))
	}))
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cases := []string{"NEW_RELIC_LICENSE_KEY", "new_relic_license_key"}
	for _, n := range cases {
		t.Run(n, func(t *testing.T) {
			cmd := ConfigEnvvarSetCmd()
			_ = cmd.Flags().Set("from-file", "/dev/null")
			_ = cmd.Flags().Set("skip-confirmation", "true")
			var stdout bytes.Buffer
			cmd.SetOut(&stdout)
			cmd.SetErr(&bytes.Buffer{})
			cmd.SetContext(ctxWithAppEnv(42, 7))

			err := runEnvvarSet(cmd, []string{n})
			if err == nil {
				t.Errorf("expected error blocking %s, got nil", n)
			}
			requireAlreadyPrintedError(t, err)
			if !strings.Contains(stdout.String(), "New Relic") {
				t.Errorf("stdout must mention 'New Relic'; got %q", stdout.String())
			}
		})
	}
}

// TestEnvvarSetPassesReloadManifestFalseWhenSkipConfirmation pins the
// wire-level shape: --skip-confirmation short-circuits the prompt to false
// and that value is forwarded to the mutation input.
func TestEnvvarSetPassesReloadManifestFalseWhenSkipConfirmation(t *testing.T) {
	stub := &envvarMutationStub{
		respBody: `{"data":{"addEnvironmentVariable":{"environmentVariables":{"total":1,"nodes":[{"name":"MY_VAR"}]}}}}`,
	}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	dir := t.TempDir()
	valuePath := filepath.Join(dir, "v.txt")
	if err := os.WriteFile(valuePath, []byte("x"), 0600); err != nil {
		t.Fatalf("write tmp value: %v", err)
	}

	cmd := ConfigEnvvarSetCmd()
	_ = cmd.Flags().Set("from-file", valuePath)
	_ = cmd.Flags().Set("skip-confirmation", "true")
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	cmd.SetContext(ctxWithAppEnv(42, 7))

	if err := runEnvvarSet(cmd, []string{"FOO"}); err != nil {
		t.Fatalf("runEnvvarSet: %v", err)
	}
	if !strings.Contains(stub.body(), `"reloadManifest":false`) {
		t.Errorf("mutation body must include reloadManifest:false on --skip-confirmation; body=%s", stub.body())
	}
	// --skip-confirmation must also suppress the post-success deploy warning.
	if strings.Contains(stdout.String(), "Important:") {
		t.Errorf("ShowDeployWarning must NOT fire under --skip-confirmation; stdout=%q", stdout.String())
	}
}

// TestEnvvarSetValueEchoDeclineCancels covers the Task 3 value-echo gate:
// --from-file present, --skip-confirmation absent → handler echoes value
// + prompts → VIP_NON_INTERACTIVE makes Confirm return ErrNonInteractive
// → handler treats as decline → yellow "Command cancelled by user." +
// exit 0, mutation must NOT fire.
func TestEnvvarSetValueEchoDeclineCancels(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	stub := &envvarMutationStub{respBody: `{"data":null}`}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	dir := t.TempDir()
	p := filepath.Join(dir, "v.txt")
	if err := os.WriteFile(p, []byte("secret"), 0600); err != nil {
		t.Fatalf("write tmp value: %v", err)
	}

	cmd := ConfigEnvvarSetCmd()
	_ = cmd.Flags().Set("from-file", p) // NOT skip-confirmation
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	cmd.SetContext(ctxWithAppEnv(42, 7))

	if err := runEnvvarSet(cmd, []string{"FOO"}); err != nil {
		t.Fatalf("expected nil (clean cancel); got %v", err)
	}
	if !strings.Contains(stdout.String(), "Command cancelled by user.") {
		t.Errorf("expected Node-parity cancel wording; got %q", stdout.String())
	}
	if strings.Contains(stub.body(), "AddEnvironmentVariable") {
		t.Errorf("mutation must NOT fire on value-confirm decline; body=%s", stub.body())
	}
	// Echo banners must have been printed (both opening + closing — the
	// closing banner pins that EchoValueForConfirm ran to completion).
	if !strings.Contains(stdout.String(), "===== Received value printed below =====") {
		t.Errorf("value-echo opening banner missing; got %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "===== Received value printed above =====") {
		t.Errorf("value-echo closing banner missing; got %q", stdout.String())
	}
}

func TestEnvvarSetInvalidName(t *testing.T) {
	stub := &envvarMutationStub{respBody: `{"data":null}`}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarSetCmd()
	_ = cmd.Flags().Set("from-file", "/dev/null")
	_ = cmd.Flags().Set("skip-confirmation", "true")
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	cmd.SetContext(ctxWithAppEnv(42, 7))

	err := runEnvvarSet(cmd, []string{"bad-name-with-dash"})
	if err == nil {
		t.Fatal("expected error for invalid name, got nil")
	}
	requireAlreadyPrintedError(t, err)
	if !strings.Contains(stdout.String(), "A-Z, 0-9, or _") {
		t.Errorf("stdout must include Node-parity error text; got %q", stdout.String())
	}
	// Mutation must NOT have been called for an invalid name.
	if strings.Contains(stub.body(), `"operationName":"AddEnvironmentVariable"`) {
		t.Errorf("mutation must not fire on invalid name; body=%s", stub.body())
	}
}

package commands

import (
	"bytes"
	"strings"
	"testing"
)

func TestEnvvarDeleteSkipConfirmation(t *testing.T) {
	stub := &envvarMutationStub{
		respBody: `{"data":{"deleteEnvironmentVariable":{"environmentVariables":{"total":0,"nodes":[]}}}}`,
	}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarDeleteCmd()
	_ = cmd.Flags().Set("skip-confirmation", "true")
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	cmd.SetContext(ctxWithAppEnv(42, 7))

	if err := runEnvvarDelete(cmd, []string{"my_var"}); err != nil {
		t.Fatalf("runEnvvarDelete: %v", err)
	}

	out := stdout.String()
	if !strings.Contains(out, `Successfully deleted environment variable "MY_VAR"`) {
		t.Errorf("stdout = %q, want success delete message with uppercased quoted name", out)
	}
	body := stub.body()
	if !strings.Contains(body, `"operationName":"DeleteEnvironmentVariable"`) {
		t.Errorf("expected DeleteEnvironmentVariable op; body=%s", body)
	}
	if !strings.Contains(body, `"value":""`) {
		t.Errorf("delete must send empty-string value; body=%s", body)
	}
	if !strings.Contains(body, `"name":"MY_VAR"`) {
		t.Errorf("expected uppercased name=MY_VAR; body=%s", body)
	}
}

// TestEnvvarDeletePassesReloadManifestFalseWhenSkipConfirmation pins the
// wire-level shape: --skip-confirmation short-circuits the prompt to false
// and that value is forwarded to the mutation input.
func TestEnvvarDeletePassesReloadManifestFalseWhenSkipConfirmation(t *testing.T) {
	stub := &envvarMutationStub{
		respBody: `{"data":{"deleteEnvironmentVariable":{"environmentVariables":{"total":0,"nodes":[]}}}}`,
	}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarDeleteCmd()
	_ = cmd.Flags().Set("skip-confirmation", "true")
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	cmd.SetContext(ctxWithAppEnv(42, 7))

	if err := runEnvvarDelete(cmd, []string{"FOO"}); err != nil {
		t.Fatalf("runEnvvarDelete: %v", err)
	}
	if !strings.Contains(stub.body(), `"reloadManifest":false`) {
		t.Errorf("mutation body must include reloadManifest:false on --skip-confirmation; body=%s", stub.body())
	}
	// --skip-confirmation must also suppress the post-success deploy warning.
	if strings.Contains(stdout.String(), "Important:") {
		t.Errorf("ShowDeployWarning must NOT fire under --skip-confirmation; stdout=%q", stdout.String())
	}
}

// TestEnvvarDeleteInputGateCancelsOnNonInteractive: VIP_NON_INTERACTIVE=1
// forces Input to return ErrNonInteractive, which the handler treats as
// decline. Mutation must NOT fire.
//
// Coverage gap noted: the SECOND gate ("Are you sure? Deletion is permanent")
// fires only after the first gate passes with a correctly typed name.
// VIP_NON_INTERACTIVE flips both Input and Confirm to ErrNonInteractive
// uniformly, so the first gate always wins under that mechanism. The second
// gate is structurally identical (same three-branch ErrNonInteractive
// pattern) and is exercised manually during staging smoke; an injectable-
// stdin test harness is the proper path to close this gap (out of scope
// for M6b — flagged for the M7 import sub-project which has similar
// interactive-prompt test needs).
func TestEnvvarDeleteInputGateCancelsOnNonInteractive(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	stub := &envvarMutationStub{respBody: `{"data":null}`}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarDeleteCmd() // NOT skip-confirmation
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	cmd.SetContext(ctxWithAppEnv(42, 7))

	if err := runEnvvarDelete(cmd, []string{"FOO"}); err != nil {
		t.Fatalf("expected nil clean cancel; got %v", err)
	}
	if !strings.Contains(stdout.String(), "Command cancelled by user.") {
		t.Errorf("expected Node-parity cancel wording; got %q", stdout.String())
	}
	if strings.Contains(stub.body(), "DeleteEnvironmentVariable") {
		t.Errorf("mutation must NOT fire on typed-mismatch cancel; body=%s", stub.body())
	}
}

func TestEnvvarDeleteInvalidName(t *testing.T) {
	stub := &envvarMutationStub{respBody: `{"data":null}`}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarDeleteCmd()
	_ = cmd.Flags().Set("skip-confirmation", "true")
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	cmd.SetContext(ctxWithAppEnv(42, 7))

	err := runEnvvarDelete(cmd, []string{"bad-name-with-dash"})
	if err == nil {
		t.Fatal("expected error for invalid name, got nil")
	}
	requireAlreadyPrintedError(t, err)
	if !strings.Contains(stdout.String(), "A-Z, 0-9, or _") {
		t.Errorf("stdout must include Node-parity error text; got %q", stdout.String())
	}
	// Mutation must NOT have been called.
	if strings.Contains(stub.body(), `"operationName":"DeleteEnvironmentVariable"`) {
		t.Errorf("mutation must not fire on invalid name; body=%s", stub.body())
	}
}

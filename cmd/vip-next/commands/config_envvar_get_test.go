package commands

import (
	"bytes"
	"strings"
	"testing"
)

func TestConfigEnvvarGetFound(t *testing.T) {
	srv := envvarStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":2,"nodes":[{"name":"FOO","value":"hello"},{"name":"BAR","value":"world"}]}}]}}}`)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarGetCmd()
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	cmd.SetContext(ctxWithAppEnv(1, 2))

	if err := runEnvvarGet(cmd, []string{"FOO"}); err != nil {
		t.Fatalf("runEnvvarGet: %v", err)
	}
	if strings.TrimSpace(buf.String()) != "hello" {
		t.Errorf("stdout = %q, want \"hello\"", buf.String())
	}
}

// TestConfigEnvvarGetLowercaseInputUppercased confirms Node's uppercasing —
// "foo" must resolve to FOO. The stub server returns FOO/BAR regardless of
// query (no per-name filtering server-side, so the assertion is on the
// resolved stdout, not the request).
func TestConfigEnvvarGetLowercaseInputUppercased(t *testing.T) {
	srv := envvarStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":1,"nodes":[{"name":"FOO","value":"hello"}]}}]}}}`)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarGetCmd()
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	cmd.SetContext(ctxWithAppEnv(1, 2))

	if err := runEnvvarGet(cmd, []string{"foo"}); err != nil {
		t.Fatalf("runEnvvarGet: %v", err)
	}
	if strings.TrimSpace(buf.String()) != "hello" {
		t.Errorf("lowercase input must be uppercased to FOO; got stdout=%q", buf.String())
	}
}

func TestConfigEnvvarGetNotFoundIsYellowStdoutExit0(t *testing.T) {
	srv := envvarStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":1,"nodes":[{"name":"FOO","value":"hello"}]}}]}}}`)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarGetCmd()
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	cmd.SetContext(ctxWithAppEnv(1, 2))

	if err := runEnvvarGet(cmd, []string{"MISSING"}); err != nil {
		t.Fatalf("not-found must NOT error (Node parity); got %v", err)
	}
	out := buf.String()
	// Node uses JSON.stringify which double-quotes the name. Go's %q matches.
	if !strings.Contains(out, `"MISSING"`) || !strings.Contains(out, "does not exist") {
		t.Errorf("stdout missing Node-parity not-found phrase; got=%q", out)
	}
}

func TestConfigEnvvarGetMissingArgErrors(t *testing.T) {
	cmd := ConfigEnvvarGetCmd()
	cmd.SetContext(ctxWithAppEnv(1, 2))
	err := runEnvvarGet(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "Please supply 1 argument") {
		t.Errorf("err = %v, want Node-parity required-arg error", err)
	}
}

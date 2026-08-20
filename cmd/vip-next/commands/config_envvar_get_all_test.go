package commands

import (
	"bytes"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/output"
)

func TestConfigEnvvarGetAllReturnsValues(t *testing.T) {
	srv := envvarStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":2,"nodes":[{"name":"FOO","value":"1"},{"name":"BAR","value":"two"}]}}]}}}`)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarGetAllCmd()
	cmd.SetContext(ctxWithAppEnv(1, 2))

	data, err := runEnvvarGetAll(cmd, nil)
	if err != nil {
		t.Fatalf("runEnvvarGetAll: %v", err)
	}
	rows, ok := data.(output.OrderedRows)
	if !ok {
		t.Fatalf("data type = %T, want OrderedRows", data)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(rows))
	}
	if rows[0][0].Key != "name" || rows[0][1].Key != "value" {
		t.Errorf("row 0 columns = %s/%s, want name/value", rows[0][0].Key, rows[0][1].Key)
	}
	if rows[0][0].Value.(string) != "FOO" || rows[0][1].Value.(string) != "1" {
		t.Errorf("row 0 = %+v, want FOO/1", rows[0])
	}
	if rows[1][0].Value.(string) != "BAR" || rows[1][1].Value.(string) != "two" {
		t.Errorf("row 1 = %+v, want BAR/two", rows[1])
	}
}

func TestConfigEnvvarGetAllKeyValueChangesColumn(t *testing.T) {
	srv := envvarStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":1,"nodes":[{"name":"FOO","value":"hello"}]}}]}}}`)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarGetAllCmd()
	_ = cmd.Flags().Set("format", "keyValue")
	cmd.SetContext(ctxWithAppEnv(1, 2))

	data, err := runEnvvarGetAll(cmd, nil)
	if err != nil {
		t.Fatalf("runEnvvarGetAll: %v", err)
	}
	rows := data.(output.OrderedRows)
	if rows[0][0].Key != "key" || rows[0][1].Key != "value" {
		t.Errorf("keyValue must use key/value columns; got %s/%s", rows[0][0].Key, rows[0][1].Key)
	}
}

func TestConfigEnvvarGetAllEmptyPrintsYellow(t *testing.T) {
	srv := envvarStubServer(t, `{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":0,"nodes":[]}}]}}}`)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigEnvvarGetAllCmd()
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	cmd.SetContext(ctxWithAppEnv(1, 2))

	data, err := runEnvvarGetAll(cmd, nil)
	if err != nil {
		t.Fatalf("runEnvvarGetAll: %v", err)
	}
	if data != nil {
		t.Errorf("empty case must return nil data; got %+v", data)
	}
	if !strings.Contains(buf.String(), "There are no environment variables") {
		t.Errorf("empty must print Node-parity message; got=%q", buf.String())
	}
}

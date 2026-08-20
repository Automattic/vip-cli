package hostops

import (
	"strings"
	"testing"
)

func TestBuildPrivilegedScriptIncludesBothOps(t *testing.T) {
	plan := PrivilegedPlan{
		GOOS:     "darwin",
		CAPath:   "/x/ca.pem",
		HostsAdd: []string{"example.test"},
	}
	script, err := buildPrivilegedScript(plan)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(script, "add-trusted-cert") {
		t.Fatalf("script missing trust op:\n%s", script)
	}
	if !strings.Contains(script, "example.test") || !strings.Contains(script, "/etc/hosts") {
		t.Fatalf("script missing hosts op:\n%s", script)
	}
	// the script must be a single set -e shell program
	if !strings.HasPrefix(script, "#!/bin/sh") {
		t.Fatalf("script should be a /bin/sh program:\n%s", script)
	}
}

func TestBuildPrivilegedScriptTrustOnly(t *testing.T) {
	script, err := buildPrivilegedScript(PrivilegedPlan{GOOS: "darwin", CAPath: "/x/ca.pem"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(script, "/etc/hosts") {
		t.Fatalf("no hosts ops requested; script should not touch /etc/hosts:\n%s", script)
	}
}

func TestBuildPrivilegedScriptRemoveOnly(t *testing.T) {
	script, err := buildPrivilegedScript(PrivilegedPlan{GOOS: "darwin", HostsRemove: true})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(script, "/etc/hosts") || !strings.Contains(script, beginMarker) {
		t.Fatalf("remove plan should strip the managed block:\n%s", script)
	}
	if strings.Contains(script, "add-trusted-cert") {
		t.Fatalf("no CAPath given; script should not trust a cert:\n%s", script)
	}
}

func TestBuildPrivilegedScriptUnsupportedOSErrors(t *testing.T) {
	if _, err := buildPrivilegedScript(PrivilegedPlan{GOOS: "plan9", CAPath: "/x/ca.pem"}); err == nil {
		t.Fatal("expected error: trust not supported on plan9")
	}
}

func TestBuildPrivilegedScriptRejectsBadHostname(t *testing.T) {
	_, err := buildPrivilegedScript(PrivilegedPlan{GOOS: "darwin", HostsAdd: []string{"bad host\nattacker"}})
	if err == nil {
		t.Fatal("expected error for hostname with embedded whitespace/newline")
	}
}

func TestBuildPrivilegedScriptAddBeatsRemove(t *testing.T) {
	script, err := buildPrivilegedScript(PrivilegedPlan{GOOS: "darwin", HostsAdd: []string{"a.test"}, HostsRemove: true})
	if err != nil {
		t.Fatal(err)
	}
	// HostsAdd path writes the block (append heredoc); it must include the host.
	if !strings.Contains(script, "127.0.0.1 a.test") {
		t.Fatalf("HostsAdd should win when both set:\n%s", script)
	}
}

func TestBuildPowerShellScriptWritesWindowsHostsAndTrust(t *testing.T) {
	ps, err := buildWindowsScript(PrivilegedPlan{CAPath: `C:\tmp\ca.pem`, HostsAdd: []string{"demo.vipdev.site"}})
	if err != nil {
		t.Fatalf("buildWindowsScript: %v", err)
	}
	for _, want := range []string{
		`certutil`, `-addstore`, `Root`, `ca.pem`,
		`drivers\etc\hosts`,
		beginMarker, endMarker, "127.0.0.1 demo.vipdev.site",
	} {
		if !strings.Contains(ps, want) {
			t.Fatalf("powershell script missing %q:\n%s", want, ps)
		}
	}
}

func TestBuildWindowsScriptRejectsBadHost(t *testing.T) {
	if _, err := buildWindowsScript(PrivilegedPlan{HostsAdd: []string{"bad host"}}); err == nil {
		t.Fatal("expected error for hostname with whitespace")
	}
}

func TestShellQuote(t *testing.T) {
	cases := map[string]string{
		"":       "''",
		"abc":    "'abc'",
		"a'b":    `'a'\''b'`,
		"/a b/c": "'/a b/c'",
	}
	for in, want := range cases {
		if got := shellQuote(in); got != want {
			t.Errorf("shellQuote(%q) = %q, want %q", in, got, want)
		}
	}
}

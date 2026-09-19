package hostops

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// etcHosts is the real hosts file the elevated script rewrites (as root). The
// unit-tested EnsureHosts/RemoveHosts in hosts.go are path-injected; the
// privileged path uses this fixed location.
const etcHosts = "/etc/hosts"

// PrivilegedPlan describes the host-privileged operations to run under a single
// elevation: trusting the CA (CAPath) and/or rewriting the managed /etc/hosts
// block (HostsAdd) or removing it (HostsRemove).
type PrivilegedPlan struct {
	GOOS   string
	CAPath string
	// HostsAdd is the list of hostnames to write into the managed /etc/hosts block.
	// WARNING: wildcard hostnames (e.g. *.example.test) are valid TLS SANs but are
	// NOT valid /etc/hosts entries — the resolver ignores them. Callers (Plan 4)
	// must filter wildcard SANs out of CertSANs before passing them here.
	HostsAdd    []string
	HostsRemove bool
}

// shellQuote single-quotes s for safe POSIX-sh interpolation.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// shellJoin shell-quotes each argv element and joins them with spaces.
func shellJoin(argv []string) string {
	q := make([]string, len(argv))
	for i, a := range argv {
		q[i] = shellQuote(a)
	}
	return strings.Join(q, " ")
}

// stripBlockScript emits sh that removes the managed block from /etc/hosts via a
// temp file, overwriting through a redirect (not mv) so the file keeps its
// existing ownership/permissions.
func stripBlockScript() string {
	return fmt.Sprintf(`__vip_tmp="$(mktemp)"
sed -e '/^%s$/,/^%s$/d' '%s' > "$__vip_tmp"
cat "$__vip_tmp" > '%s'
rm -f "$__vip_tmp"
`, beginMarker, endMarker, etcHosts, etcHosts)
}

// buildPrivilegedScript returns a single /bin/sh program performing all of the
// plan's privileged operations, to be run once under elevation. Trust runs
// first; the /etc/hosts rewrite happens in-script (as root). Returns an error
// if the OS is unsupported for trust or a hostname is invalid.
func buildPrivilegedScript(plan PrivilegedPlan) (string, error) {
	var b strings.Builder
	b.WriteString("#!/bin/sh\nset -e\n")
	if plan.CAPath != "" {
		argv, err := trustCommand(plan.GOOS, plan.CAPath)
		if err != nil {
			return "", err
		}
		b.WriteString(shellJoin(argv) + "\n")
	}
	// HostsAdd takes precedence over HostsRemove when both are set.
	switch {
	case len(plan.HostsAdd) > 0:
		if err := validateHosts(plan.HostsAdd); err != nil {
			return "", err
		}
		b.WriteString(stripBlockScript())
		b.WriteString(fmt.Sprintf("cat >> %s <<'__VIP_HOSTS_EOF__'\n", etcHosts))
		b.WriteString(renderBlock(plan.HostsAdd))
		b.WriteString("__VIP_HOSTS_EOF__\n")
	case plan.HostsRemove:
		b.WriteString(stripBlockScript())
	}
	return b.String(), nil
}

// windowsHostsPath is the hosts file PowerShell edits (from native Windows or
// WSL via powershell.exe). $env:SystemRoot expands at runtime.
const windowsHostsPath = `$env:SystemRoot\System32\drivers\etc\hosts`

// buildWindowsScript returns a PowerShell program that (optionally) trusts the
// CA via certutil and rewrites the managed block in the Windows hosts file.
// Mirrors buildPrivilegedScript but for the Windows target (native + WSL).
func buildWindowsScript(plan PrivilegedPlan) (string, error) {
	var b strings.Builder
	b.WriteString("$ErrorActionPreference = 'Stop'\n")
	if plan.CAPath != "" {
		b.WriteString(fmt.Sprintf("certutil -addstore -f Root %s\n", psQuote(plan.CAPath)))
	}
	switch {
	case len(plan.HostsAdd) > 0:
		if err := validateHosts(plan.HostsAdd); err != nil {
			return "", err
		}
		b.WriteString(fmt.Sprintf("$hf = \"%s\"\n", windowsHostsPath))
		b.WriteString("$lines = if (Test-Path $hf) { Get-Content $hf } else { @() }\n")
		b.WriteString(fmt.Sprintf("$out = @(); $in = $false\nforeach ($l in $lines) { if ($l.Trim() -eq %s) { $in = $true; continue }; if ($l.Trim() -eq %s) { $in = $false; continue }; if (-not $in) { $out += $l } }\n", psQuote(beginMarker), psQuote(endMarker)))
		b.WriteString(fmt.Sprintf("$out += %s\n", psQuote(beginMarker)))
		for _, h := range plan.HostsAdd {
			b.WriteString(fmt.Sprintf("$out += %s\n", psQuote("127.0.0.1 "+h)))
		}
		b.WriteString(fmt.Sprintf("$out += %s\n", psQuote(endMarker)))
		b.WriteString("Set-Content -Path $hf -Value $out -Encoding ASCII\n")
	case plan.HostsRemove:
		b.WriteString(fmt.Sprintf("$hf = \"%s\"\n", windowsHostsPath))
		b.WriteString("if (Test-Path $hf) { $lines = Get-Content $hf; $out = @(); $in = $false\n")
		b.WriteString(fmt.Sprintf("foreach ($l in $lines) { if ($l.Trim() -eq %s) { $in = $true; continue }; if ($l.Trim() -eq %s) { $in = $false; continue }; if (-not $in) { $out += $l } }\n", psQuote(beginMarker), psQuote(endMarker)))
		b.WriteString("Set-Content -Path $hf -Value $out -Encoding ASCII }\n")
	}
	return b.String(), nil
}

// psQuote single-quotes s for PowerShell (doubling embedded single quotes).
func psQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// planActions describes, in plain language, what a privileged plan will change —
// used to tell the user why a UAC / sudo prompt is about to appear.
func planActions(plan PrivilegedPlan) []string {
	var a []string
	if plan.CAPath != "" {
		a = append(a, "trust the local development HTTPS certificate")
	}
	switch {
	case len(plan.HostsAdd) > 0:
		a = append(a, "add local hostnames to your hosts file")
	case plan.HostsRemove:
		a = append(a, "remove local hostnames from your hosts file")
	}
	return a
}

// joinAnd joins phrases into "a", "a and b", or "a, b, and c".
func joinAnd(items []string) string {
	switch len(items) {
	case 0:
		return ""
	case 1:
		return items[0]
	case 2:
		return items[0] + " and " + items[1]
	default:
		return strings.Join(items[:len(items)-1], ", ") + ", and " + items[len(items)-1]
	}
}

// Apply runs the plan's privileged operations under a SINGLE elevation,
// dispatching by runtime context: ctxWindows (native Windows / WSL) edits the
// Windows hosts file + cert store via powershell.exe RunAs; everything else
// (macOS / native Linux) edits /etc/hosts via sudo /bin/sh.
func Apply(plan PrivilegedPlan) error {
	if currentContext() == ctxWindows {
		return applyWindows(plan)
	}
	return applyUnix(plan)
}

// applyWindows writes the PowerShell script to a temp .ps1 and runs it elevated.
// From native Windows AND from WSL, `powershell.exe` is invokable; Start-Process
// -Verb RunAs triggers the UAC prompt and edits the Windows hosts/cert store.
func applyWindows(plan PrivilegedPlan) error {
	script, err := buildWindowsScript(plan)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp("", "vip-dev-env-priv-*.ps1")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err := f.WriteString(script); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if actions := planActions(plan); len(actions) > 0 {
		fmt.Fprintf(os.Stderr, "\nAdministrator access is needed to %s.\nApprove the Windows (UAC) prompt to continue...\n", joinAnd(actions))
	}
	inner := fmt.Sprintf("$p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%s'; exit $p.ExitCode", name)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-Command", inner)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		return err
	}
	if plan.CAPath != "" {
		fmt.Fprintln(os.Stderr, "Local HTTPS certificate trusted. Restart your browser for it to take effect.")
	}
	return nil
}

// applyUnix runs the plan's privileged operations under a SINGLE elevation — one
// `sudo /bin/sh <script>` invocation, i.e. one password prompt for both the CA
// trust and the /etc/hosts edit. Not unit-tested (it prompts/execs); exercised
// by the Task 11 integration harness.
//
// We use sudo rather than macOS osascript's "with administrator privileges"
// even on darwin: osascript elevates in a context detached from the login GUI
// session, where `security add-trusted-cert` cannot authorize System-keychain
// trust settings ("SecTrustSettingsSetTrustSettings: the authorization was
// denied since no user interaction was possible") — it adds the cert but leaves
// it untrusted. sudo from the terminal keeps the session context, so the
// Security Agent can authorize the trust change. vip is always run from a
// terminal, so a TTY for the sudo prompt is available. (Validated 2026-06-19;
// see docs/superpowers/notes/2026-06-18-traefik-openssl-cert-contract.md.)
func applyUnix(plan PrivilegedPlan) error {
	script, err := buildPrivilegedScript(plan)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp("", "vip-dev-env-priv-*.sh")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err := f.WriteString(script); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if actions := planActions(plan); len(actions) > 0 {
		fmt.Fprintf(os.Stderr, "\nAdministrator access is needed to %s.\nYou may be prompted for your password...\n", joinAnd(actions))
	}
	cmd := exec.Command("sudo", "/bin/sh", name)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return err
	}
	if plan.CAPath != "" {
		fmt.Fprintln(os.Stderr, "Local HTTPS certificate trusted. Restart your browser for it to take effect.")
	}
	return nil
}

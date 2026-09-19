// Package hostops performs the two host-privileged operations a vip dev
// environment needs — trusting the local CA in the system trust store and
// editing the managed /etc/hosts block — and runs them under a SINGLE privilege
// elevation (spec §11). Plan 4 calls hostops.Apply(PrivilegedPlan) once: it
// builds one /bin/sh script doing both ops and runs it behind one sudo prompt
// (sudo, not macOS osascript — osascript's detached context can't authorize the
// System-keychain trust change; see Apply). The block format and trust/elevation
// command construction are pure and unit-tested; the elevated run is exercised
// by the integration checklist. RenderHostsBlock previews the block; EnsureHosts
// /RemoveHosts are the path-injected reference editors used in tests.
package hostops

import (
	"fmt"
	"os"
	"strings"
)

const (
	beginMarker = "# BEGIN vip-dev-env"
	endMarker   = "# END vip-dev-env"
)

// renderBlock builds the managed hosts block for the given hostnames.
func renderBlock(hosts []string) string {
	var b strings.Builder
	b.WriteString(beginMarker + "\n")
	for _, h := range hosts {
		b.WriteString("127.0.0.1 " + h + "\n")
	}
	b.WriteString(endMarker + "\n")
	return b.String()
}

// validateHosts rejects hostnames that would corrupt the hosts file (embedded
// whitespace/newlines could inject unmanaged entries when written as root).
func validateHosts(hosts []string) error {
	for _, h := range hosts {
		if h == "" || strings.ContainsAny(h, " \t\r\n") {
			return fmt.Errorf("hostops: invalid hostname %q", h)
		}
	}
	return nil
}

// stripBlock returns content with the managed block removed. It errors on a
// malformed file (a begin marker without a matching end marker) rather than
// silently discarding everything to EOF, which would lose unmanaged content.
func stripBlock(content string) (string, error) {
	lines := strings.Split(content, "\n")
	var out []string
	inBlock := false
	for _, ln := range lines {
		trimmed := strings.TrimSpace(ln)
		if trimmed == beginMarker {
			inBlock = true
			continue
		}
		if trimmed == endMarker {
			inBlock = false
			continue
		}
		if !inBlock {
			out = append(out, ln)
		}
	}
	if inBlock {
		return "", fmt.Errorf("hostops: malformed hosts file: %s without matching %s", beginMarker, endMarker)
	}
	return strings.Join(out, "\n"), nil
}

// EnsureHosts writes (or replaces) the managed block in the hosts file at path,
// mapping each hostname to 127.0.0.1. Idempotent; preserves other content. An
// empty hosts slice removes the managed block (delegates to RemoveHosts).
func EnsureHosts(path string, hosts []string) error {
	if len(hosts) == 0 {
		return RemoveHosts(path)
	}
	if err := validateHosts(hosts); err != nil {
		return err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	stripped, err := stripBlock(string(b))
	if err != nil {
		return err
	}
	stripped = strings.TrimRight(stripped, "\n")
	block := renderBlock(hosts)
	updated := block
	if stripped != "" {
		updated = stripped + "\n" + block
	}
	return os.WriteFile(path, []byte(updated), 0o644)
}

// HostsPresent reports whether the managed block in the real /etc/hosts already
// contains every hostname in hosts — a non-privileged read so Start can skip the
// sudo elevation when the entries are unchanged. An empty list is trivially
// present; an unreadable file reports false (fall back to elevating).
func HostsPresent(hosts []string) bool {
	if len(hosts) == 0 {
		return true
	}
	path := etcHosts
	if currentContext() == ctxWindows {
		path = windowsHostsReadPath()
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return hostsPresentIn(string(b), hosts)
}

// ManagedHostsMatch reports whether the managed block contains exactly hosts.
// Unlike HostsPresent, it also detects stale extra entries, so callers that own
// the complete global snapshot can safely decide whether a rewrite is needed.
func ManagedHostsMatch(hosts []string) bool {
	path := etcHosts
	if currentContext() == ctxWindows {
		path = windowsHostsReadPath()
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return managedHostsMatchIn(string(b), hosts)
}

// windowsHostsReadPath returns a non-privileged readable path to the Windows
// hosts file: the drvfs mount under WSL, else the native Windows path.
func windowsHostsReadPath() string {
	if _, err := os.Stat("/mnt/c/Windows/System32/drivers/etc/hosts"); err == nil {
		return "/mnt/c/Windows/System32/drivers/etc/hosts"
	}
	if sr := os.Getenv("SystemRoot"); sr != "" {
		return sr + `\System32\drivers\etc\hosts`
	}
	return `C:\Windows\System32\drivers\etc\hosts`
}

// hostsPresentIn is the pure core of HostsPresent: it reports whether the
// managed block within content lists every requested hostname.
func hostsPresentIn(content string, hosts []string) bool {
	have := map[string]bool{}
	inBlock := false
	for _, ln := range strings.Split(content, "\n") {
		t := strings.TrimSpace(ln)
		switch {
		case t == beginMarker:
			inBlock = true
		case t == endMarker:
			inBlock = false
		case inBlock:
			fields := strings.Fields(t)
			if len(fields) < 2 {
				continue
			}
			for _, name := range fields[1:] { // skip the leading IP
				have[name] = true
			}
		}
	}
	for _, h := range hosts {
		if !have[h] {
			return false
		}
	}
	return true
}

func managedHostsMatchIn(content string, hosts []string) bool {
	if validateHosts(hosts) != nil {
		return false
	}
	want := map[string]bool{}
	for _, host := range hosts {
		want[host] = true
	}
	have := map[string]bool{}
	inBlock := false
	sawBegin := false
	sawEnd := false
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		switch trimmed {
		case beginMarker:
			if inBlock || sawBegin {
				return false
			}
			inBlock = true
			sawBegin = true
		case endMarker:
			if !inBlock || sawEnd {
				return false
			}
			inBlock = false
			sawEnd = true
		default:
			if !inBlock {
				continue
			}
			fields := strings.Fields(trimmed)
			if len(fields) < 2 {
				continue
			}
			for _, name := range fields[1:] {
				have[name] = true
			}
		}
	}
	if inBlock || sawBegin != sawEnd {
		return false
	}
	if len(want) == 0 && !sawBegin {
		return true
	}
	if len(have) != len(want) {
		return false
	}
	for host := range want {
		if !have[host] {
			return false
		}
	}
	return true
}

// RenderHostsBlock returns the managed /etc/hosts block (begin/end markers and
// the 127.0.0.1 mappings) for the given hostnames, without touching any file —
// for Plan 4 to preview what Apply will write under elevation.
func RenderHostsBlock(hosts []string) string {
	return renderBlock(hosts)
}

// RemoveHosts strips the managed block from the hosts file at path.
func RemoveHosts(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	stripped, err := stripBlock(string(b))
	if err != nil {
		return err
	}
	stripped = strings.TrimRight(stripped, "\n")
	if stripped == "" {
		return os.WriteFile(path, []byte(""), 0o644)
	}
	return os.WriteFile(path, []byte(stripped+"\n"), 0o644)
}

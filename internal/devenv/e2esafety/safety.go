// Package e2esafety contains side-effect-free policy for destructive tagged tests.
package e2esafety

import (
	"fmt"
	"io"
	"sort"
	"strings"
)

const GateMessage = "SKIP devenv_e2e: set VIP_DEVENV_E2E=1 to permit Docker, certificate, and hosts changes"

func Enabled(getenv func(string) string) bool {
	return getenv("VIP_DEVENV_E2E") == "1"
}

func Skip(getenv func(string) string, out io.Writer) bool {
	if Enabled(getenv) {
		return false
	}
	fmt.Fprintln(out, GateMessage)
	return true
}

type Snapshot map[string]string

func (s Snapshot) RequireClean() error {
	var existing []string
	for name, identity := range s {
		if identity != "" {
			existing = append(existing, name)
		}
	}
	if len(existing) == 0 {
		return nil
	}
	sort.Strings(existing)
	return fmt.Errorf("devenv_e2e refuses to modify existing shared state: %s; clean or isolate it manually", strings.Join(existing, ", "))
}

func CanRemove(created, current string) bool {
	return created != "" && current == created
}

func AllOwnedMatch(owned, current Snapshot) bool {
	for name, created := range owned {
		if created != "" && !CanRemove(created, current[name]) {
			return false
		}
	}
	return true
}

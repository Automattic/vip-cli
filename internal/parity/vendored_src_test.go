//go:build parity

package parity

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// src/, __tests__/ and friends are a VENDORED MIRROR of Automattic/vip. They
// are the reference the entire parity effort is measured against, so they must
// stay byte-identical to upstream.
//
// That invariant was broken once, silently, and it cost a lot: four lines
// implementing VIP_TOKEN_OVERRIDE had been hand-injected into
// src/lib/token.ts, plus a matching test in __tests__/lib/token.js, so the
// harness could authenticate the Node binary. The variable has never existed
// upstream (`git log --all -S VIP_TOKEN_OVERRIDE` on Automattic/vip returns
// zero commits). Because the doctored files were then treated as
// authoritative, the parity review recorded a divergence that did not exist
// (register item 2.15) and a slice "fixed" Go to match a fiction.
//
// A full upstream diff needs network access and the sibling checkout, so this
// test does not attempt one. It pins the specific, cheap invariant that would
// have caught the actual incident: no credential escape hatch anywhere in the
// vendored Node trees. If a future harness needs to authenticate Node, seed a
// real keychain entry (keychain.go) — do not edit the mirror.
func TestVendoredNodeSourceHasNoCredentialEscapeHatch(t *testing.T) {
	// Env vars that would let a caller inject an identity without the OS
	// credential store. Node's own supported hatch, WPVIP_DEPLOY_TOKEN, is
	// deliberately absent from this list: it is real upstream surface.
	forbidden := []string{
		"VIP_TOKEN_OVERRIDE",
		"VIP_ACCESS_TOKEN",
	}

	// Every vendored tree, not just src/: the historical injection touched
	// src/lib/token.ts AND __tests__/lib/token.js, so a src-only walk would
	// have caught only half of it.
	roots := []string{"src", "__tests__", "__fixtures__", "helpers", "test-utils"}

	var hits []string
	for _, r := range roots {
		root := filepath.Join("..", "..", r)
		if _, err := os.Stat(root); err != nil {
			continue // an absent vendored tree is not this test's problem
		}
		err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			switch filepath.Ext(path) {
			case ".js", ".ts", ".mjs", ".cjs":
			default:
				return nil
			}
			body, readErr := os.ReadFile(path) // #nosec G304 -- fixed vendored tree
			if readErr != nil {
				return readErr
			}
			for _, name := range forbidden {
				if strings.Contains(string(body), name) {
					hits = append(hits, path+" contains "+name)
				}
			}
			return nil
		})
		if err != nil {
			t.Fatalf("walking vendored %s/: %v", r, err)
		}
	}

	for _, h := range hits {
		t.Errorf("vendored Node source carries a credential escape hatch: %s\n"+
			"These trees mirror upstream Automattic/vip and must not be edited. "+
			"To authenticate the Node binary in a test, seed a real keychain "+
			"entry — see keychain.go.", h)
	}
}

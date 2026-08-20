package envvar

import (
	"bytes"
	"strings"
	"testing"
)

func TestPromptForReloadManifestNodejsTypeIdEmitsWarning(t *testing.T) {
	var stdout bytes.Buffer
	emitNodejsReloadWarning(&stdout, 3)
	if !strings.Contains(stdout.String(), "Only applies to runtime variable changes") {
		t.Errorf("Node.js typeId (3) should emit runtime/build-time warning; got %q", stdout.String())
	}
}

func TestPromptForReloadManifestWordPressTypeIdSilent(t *testing.T) {
	var stdout bytes.Buffer
	emitNodejsReloadWarning(&stdout, 2)
	if stdout.Len() != 0 {
		t.Errorf("non-Node.js typeId must not emit warning; got %q", stdout.String())
	}
}

func TestIsAppNodejs(t *testing.T) {
	for _, id := range []int64{3, 5, 7, 8} {
		if !isAppNodejs(id) {
			t.Errorf("typeId %d must be Node.js", id)
		}
	}
	for _, id := range []int64{0, 1, 2, 6, 99} {
		if isAppNodejs(id) {
			t.Errorf("typeId %d must NOT be Node.js", id)
		}
	}
}

func TestShowDeployWarningIncludesImportantLabel(t *testing.T) {
	var stdout bytes.Buffer
	ShowDeployWarning(&stdout)
	if !strings.Contains(stdout.String(), "Important:") || !strings.Contains(stdout.String(), "next code deploy") {
		t.Errorf("ShowDeployWarning output missing expected text; got %q", stdout.String())
	}
}

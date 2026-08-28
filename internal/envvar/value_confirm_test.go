package envvar

import (
	"bytes"
	"strings"
	"testing"
)

func TestEchoValueForConfirmBetweenBanners(t *testing.T) {
	var stdout bytes.Buffer
	EchoValueForConfirm(&stdout, "hello\nworld")
	out := stdout.String()
	if !strings.Contains(out, "===== Received value printed below =====") {
		t.Errorf("missing opening banner; got %q", out)
	}
	if !strings.Contains(out, "===== Received value printed above =====") {
		t.Errorf("missing closing banner; got %q", out)
	}
	if !strings.Contains(out, "hello\nworld") {
		t.Errorf("value not echoed verbatim; got %q", out)
	}
}

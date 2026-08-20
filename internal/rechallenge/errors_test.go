package rechallenge

import (
	"errors"
	"strings"
	"testing"
)

func TestUnsupportedVersionError(t *testing.T) {
	err := NewUnsupportedVersionError("v3", "doThing")
	if !strings.Contains(err.Error(), "v3") || !strings.Contains(err.Error(), "v2") {
		t.Errorf("message = %q; want both v3 and v2 mentioned", err.Error())
	}
	if err.Scope() != "doThing" {
		t.Errorf("Scope = %q, want doThing", err.Scope())
	}
	var rerr *Error
	if !errors.As(err, &rerr) {
		t.Error("errors.As must match base *Error")
	}
}

func TestTerminalError(t *testing.T) {
	err := NewTerminalError(StatusFailed, "doThing", "user rejected")
	if !strings.Contains(err.Error(), "failed") {
		t.Errorf("message = %q must include status", err.Error())
	}
	if !strings.Contains(err.Error(), "user rejected") {
		t.Errorf("message = %q must include detail", err.Error())
	}
	if err.Status() != StatusFailed {
		t.Errorf("Status() = %q", err.Status())
	}
}

func TestTerminalErrorWithoutDetail(t *testing.T) {
	err := NewTerminalError(StatusExpired, "doThing", "")
	if !strings.Contains(err.Error(), "expired") {
		t.Errorf("message = %q must include status", err.Error())
	}
	// Format is "Step-up verification did not complete (status=expired)."
	// when detail is empty — no ":" should appear.
	if strings.Count(err.Error(), ":") != 0 {
		t.Errorf("message = %q must not include ':' when detail is empty", err.Error())
	}
}

func TestAbortedError(t *testing.T) {
	err := NewAbortedError("doThing")
	if !strings.Contains(err.Error(), "cancelled") {
		t.Errorf("message = %q must include 'cancelled'", err.Error())
	}
}

func TestHttpError(t *testing.T) {
	err := NewHttpError(503, "service unavailable", "doThing")
	if err.StatusCode() != 503 {
		t.Errorf("StatusCode = %d, want 503", err.StatusCode())
	}
	if err.BodyText() != "service unavailable" {
		t.Errorf("BodyText = %q", err.BodyText())
	}
	if !strings.Contains(err.Error(), "503") {
		t.Errorf("message must include status code")
	}
}

func TestErrorIs(t *testing.T) {
	for _, err := range []error{
		NewUnsupportedVersionError("v3", "s"),
		NewTerminalError(StatusFailed, "s", ""),
		NewAbortedError("s"),
		NewHttpError(500, "x", "s"),
		NewInteractionRequiredError("s"),
	} {
		var base *Error
		if !errors.As(err, &base) {
			t.Errorf("errors.As(*Error) failed for %T", err)
		}
	}
}

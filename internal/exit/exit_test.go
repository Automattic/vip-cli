package exit

import (
	"bytes"
	"errors"
	"testing"
)

func TestWriteErrorFormatsMessageAndCallsHook(t *testing.T) {
	var buf bytes.Buffer
	var calledCode int
	exiter := func(code int) { calledCode = code }
	hookCalled := false
	hook := func(err error) { hookCalled = true }

	writeAndExit(&buf, exiter, hook, errors.New("boom"))

	if calledCode != 1 {
		t.Errorf("exit code = %d, want 1", calledCode)
	}
	if !hookCalled {
		t.Error("hook was not called")
	}
	if got := buf.String(); got != "Error: boom\n" {
		t.Errorf("stderr = %q, want %q", got, "Error: boom\n")
	}
}

func TestWriteErrorExitsWithoutDuplicatingAnAlreadyPrintedMessage(t *testing.T) {
	var buf bytes.Buffer
	calledCode := -1
	hookCalled := false

	writeAndExit(
		&buf,
		func(code int) { calledCode = code },
		func(error) { hookCalled = true },
		Handled(errors.New("message already shown on stdout")),
	)

	if calledCode != 1 {
		t.Errorf("exit code = %d, want 1", calledCode)
	}
	if !hookCalled {
		t.Error("hook must still observe the failure")
	}
	if buf.Len() != 0 {
		t.Errorf("already-printed error must not be duplicated on stderr; got %q", buf.String())
	}
}

func TestWriteErrorNilErrorNoOps(t *testing.T) {
	var buf bytes.Buffer
	called := false
	exiter := func(int) { called = true }
	hook := func(error) {}

	writeAndExit(&buf, exiter, hook, nil)

	if called {
		t.Error("exiter must not be called for nil error")
	}
	if buf.Len() != 0 {
		t.Errorf("stderr should be empty, got %q", buf.String())
	}
}

func TestRegisterHookReplaces(t *testing.T) {
	original := errHook
	t.Cleanup(func() { errHook = original })

	called := 0
	RegisterErrorHook(func(error) { called++ })

	errHook(errors.New("x"))
	if called != 1 {
		t.Errorf("hook called %d times, want 1", called)
	}
}

func TestWithCodeWithError(t *testing.T) {
	var buf bytes.Buffer
	var calledCode int
	exiter := func(code int) { calledCode = code }
	hookCalled := false
	hook := func(err error) { hookCalled = true }

	writeAndExitCode(&buf, exiter, hook, 42, errors.New("specific failure"))

	if calledCode != 42 {
		t.Errorf("exit code = %d, want 42", calledCode)
	}
	if !hookCalled {
		t.Error("hook was not called when err != nil")
	}
	if got := buf.String(); got != "Error: specific failure\n" {
		t.Errorf("stderr = %q, want %q", got, "Error: specific failure\n")
	}
}

func TestWithCodeNilErrorStillExits(t *testing.T) {
	var buf bytes.Buffer
	var calledCode int = -1
	exiter := func(code int) { calledCode = code }
	hookCalled := false
	hook := func(err error) { hookCalled = true }

	writeAndExitCode(&buf, exiter, hook, 0, nil)

	if calledCode != 0 {
		t.Errorf("exit code = %d, want 0", calledCode)
	}
	if hookCalled {
		t.Error("hook must not be called when err == nil")
	}
	if buf.Len() != 0 {
		t.Errorf("stderr should be empty, got %q", buf.String())
	}
}

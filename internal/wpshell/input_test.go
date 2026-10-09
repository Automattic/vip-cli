package wpshell

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"
)

func TestInputForwardsRemoteInterruptAndDrainsEOF(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	interrupts := 0
	input := NewInput(ctx, strings.NewReader("\x03x"), func() bool {
		interrupts++
		return false
	})
	reader := input.Reader(ctx)
	defer reader.Close()
	got, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "\x03x" || interrupts != 1 {
		t.Fatalf("remote stdin = %q, interrupts = %d", got, interrupts)
	}
}

func TestInputReturnsOwnershipToPrompt(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	in, writer := io.Pipe()
	defer in.Close()
	defer writer.Close()
	input := NewInput(ctx, in)
	command := input.Reader(ctx)
	finished := make(chan error, 1)
	go func() {
		_, err := io.Copy(io.Discard, command)
		finished <- err
	}()
	if err := command.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-finished:
		if err != context.Canceled {
			t.Fatalf("command read error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("command reader did not stop")
	}
	go func() { _, _ = io.WriteString(writer, "wp option get home\n") }()
	prompt := input.Reader(ctx)
	defer prompt.Close()
	buf := make([]byte, len("wp option get home\n"))
	if _, err := io.ReadFull(prompt, buf); err != nil {
		t.Fatal(err)
	}
	if string(buf) != "wp option get home\n" {
		t.Fatalf("next shell command lost bytes: %q", buf)
	}
}

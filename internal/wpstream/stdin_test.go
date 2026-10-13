package wpstream

import (
	"context"
	"io"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type pumpDestination struct {
	data      chan string
	closed    chan struct{}
	aborted   chan struct{}
	entered   chan struct{}
	closeOnce sync.Once
	abortOnce sync.Once
}

func newPumpDestination() *pumpDestination {
	return &pumpDestination{data: make(chan string, 1), closed: make(chan struct{}), aborted: make(chan struct{})}
}

func (d *pumpDestination) Write(p []byte) (int, error) {
	if d.entered != nil {
		close(d.entered)
		<-d.aborted
		return 0, errRunDone
	}
	d.data <- string(p)
	return len(p), nil
}

func (d *pumpDestination) Close() error {
	d.closeOnce.Do(func() { close(d.closed) })
	return nil
}

func (d *pumpDestination) abort(error) {
	d.abortOnce.Do(func() { close(d.aborted) })
}

type countedReader struct {
	io.Reader
	reads   atomic.Int32
	entered chan struct{}
	once    sync.Once
}

func (r *countedReader) Read(p []byte) (int, error) {
	r.reads.Add(1)
	r.once.Do(func() { close(r.entered) })
	return r.Reader.Read(p)
}

func awaitPump(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(2 * time.Second):
		t.Fatal("stdin pump timed out")
	}
}

func TestStdinPumpReconnectWhileReadBlocked(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r, w := io.Pipe()
	defer r.Close()
	defer w.Close()
	src := &countedReader{Reader: r, entered: make(chan struct{})}
	pump := newStdinPump(ctx, src, true)
	first, second := newPumpDestination(), newPumpDestination()
	pump.attach(first)
	awaitPump(t, src.entered)
	pump.detach(first)
	pump.attach(second)
	if got := src.reads.Load(); got != 1 {
		t.Fatalf("concurrent input reads: got %d, want 1", got)
	}
	if _, err := io.WriteString(w, "input\r"); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-second.data:
		if got != "input\n" {
			t.Fatalf("input after reconnect = %q", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("reconnected stream did not receive input")
	}
	select {
	case got := <-first.data:
		t.Fatalf("abandoned stream consumed input: %q", got)
	default:
	}
}

func TestStdinPumpRetriesPendingWriteAndPreservesEOF(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	pump := newStdinPump(ctx, strings.NewReader("pending"), false)
	first, second := newPumpDestination(), newPumpDestination()
	first.entered = make(chan struct{})
	pump.attach(first)
	awaitPump(t, first.entered)
	pump.detach(first)
	pump.attach(second)
	select {
	case got := <-second.data:
		if got != "pending" {
			t.Fatalf("pending input = %q", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("pending input lost on reconnect")
	}
	awaitPump(t, second.closed)
	pump.detach(second)
	third := newPumpDestination()
	pump.attach(third)
	awaitPump(t, third.closed)
}

func TestStdinPumpCancellationBetweenAttempts(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	pump := newStdinPump(ctx, nil, false)
	done := make(chan error, 1)
	go func() { _, err := pump.Write([]byte("pending")); done <- err }()
	cancel()
	select {
	case err := <-done:
		if err != context.Canceled {
			t.Fatalf("write error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancelled pump did not release writer")
	}
}

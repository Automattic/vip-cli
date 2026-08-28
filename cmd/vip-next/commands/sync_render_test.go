package commands

import (
	"bytes"
	"strings"
	"sync"
	"testing"
	"time"

	syncpkg "github.com/Automattic/vip/internal/sync"
)

// TestTTYRendererStopRaceFree exercises the Stop/goroutine-exit interlock:
// flood OnTransition concurrently with the spinner ticker, then Stop().
// Under `go test -race` this would have failed before the loopDone
// WaitGroup was added because Stop's Done() and the ticker's Render() both
// mutate MultiLineRenderer.lastLines.
//
// The test asserts no panic + the renderer produced SOME output. Detailed
// frame-shape assertions live in internal/tui/progress_test.go.
func TestTTYRendererStopRaceFree(t *testing.T) {
	// A concurrent-safe buffer so multiple goroutines can write without
	// tripping bytes.Buffer's "not safe for concurrent use" implicit contract.
	buf := &syncBuf{}
	r := newTTYRenderer(buf)

	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				r.OnTransition(syncpkg.Step{
					Step:   "step-" + string(rune('a'+id)),
					Name:   "step",
					Status: syncpkg.StatusRunning,
				})
			}
		}(i)
	}
	// Let the ticker fire a few times alongside the OnTransition flood.
	time.Sleep(spinnerInterval * 3)

	r.Stop()
	wg.Wait()

	// Idempotent stop: must not panic on a second call.
	r.Stop()

	if buf.len() == 0 {
		t.Error("expected some output written; got none")
	}
	// Spinner / step text should appear somewhere in the buffer.
	if !strings.Contains(buf.String(), "step") {
		t.Errorf("step name missing from rendered output")
	}
}

// TestTTYRendererStopWithoutTransitions covers the no-op path: Stop()
// before any OnTransition fired. Must not block (loopDone.Wait must
// return promptly) and must not panic.
func TestTTYRendererStopWithoutTransitions(t *testing.T) {
	buf := &syncBuf{}
	r := newTTYRenderer(buf)
	done := make(chan struct{})
	go func() {
		r.Stop()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Stop did not return within 1s (goroutine leak suspected)")
	}
}

// syncBuf is a tiny concurrent-safe writer for tests that hammer a
// renderer from multiple goroutines. bytes.Buffer alone would trip
// `go test -race` even without the bug under test.
type syncBuf struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuf) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuf) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func (b *syncBuf) len() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Len()
}

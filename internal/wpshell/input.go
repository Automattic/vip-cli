package wpshell

import (
	"context"
	"io"
	"sync"
)

// Input shares stdin between the prompt and remote commands. A command reader
// can be cancelled without leaving a goroutine consuming the next prompt's input.
type Input struct {
	bytes   chan byte
	done    chan struct{}
	err     error
	readMu  sync.Mutex
	pending *byte
}

func NewInput(ctx context.Context, in io.Reader, interrupt ...func() bool) *Input {
	i := &Input{bytes: make(chan byte, 1), done: make(chan struct{})}
	go func() {
		defer close(i.done)
		var b [1]byte
		for {
			n, err := in.Read(b[:])
			if n > 0 {
				if b[0] == 3 && len(interrupt) > 0 && interrupt[0]() {
					continue
				}
				select {
				case i.bytes <- b[0]:
				case <-ctx.Done():
					i.err = ctx.Err()
					return
				}
			}
			if err != nil {
				i.err = err
				return
			}
		}
	}()
	return i
}

func (i *Input) Reader(ctx context.Context) io.ReadCloser {
	ctx, cancel := context.WithCancel(ctx)
	return &inputReader{input: i, ctx: ctx, cancel: cancel}
}

type inputReader struct {
	input   *Input
	ctx     context.Context
	cancel  context.CancelFunc
	mu      sync.Mutex
	stateMu sync.Mutex
}

func (r *inputReader) Read(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.input.readMu.Lock()
	defer r.input.readMu.Unlock()
	if len(p) == 0 {
		return 0, nil
	}
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	if r.input.pending != nil {
		b := *r.input.pending
		r.input.pending = nil
		return r.deliver(p, b)
	}
	select {
	case b := <-r.input.bytes:
		return r.deliver(p, b)
	case <-r.ctx.Done():
		return 0, r.ctx.Err()
	case <-r.input.done:
		select {
		case b := <-r.input.bytes:
			return r.deliver(p, b)
		default:
		}
		return 0, r.input.err
	}
}

func (r *inputReader) deliver(p []byte, b byte) (int, error) {
	r.stateMu.Lock()
	defer r.stateMu.Unlock()
	if err := r.ctx.Err(); err != nil {
		// Keep the selected byte ahead of any later input for the next owner.
		r.input.pending = &b
		return 0, err
	}
	p[0] = b
	return 1, nil
}

func (r *inputReader) Close() error {
	r.stateMu.Lock()
	r.cancel()
	r.stateMu.Unlock()
	// Wait for a pending Read to release ownership before the prompt resumes.
	r.mu.Lock()
	r.mu.Unlock()
	return nil
}

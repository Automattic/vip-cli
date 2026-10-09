package wpshell

import (
	"context"
	"io"
	"sync"
)

// Input shares stdin between the prompt and remote commands. A command reader
// can be cancelled without leaving a goroutine consuming the next prompt's input.
type Input struct {
	bytes chan byte
	done  chan struct{}
	err   error
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
	input  *Input
	ctx    context.Context
	cancel context.CancelFunc
	mu     sync.Mutex
}

func (r *inputReader) Read(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(p) == 0 {
		return 0, nil
	}
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	select {
	case b := <-r.input.bytes:
		p[0] = b
		return 1, nil
	case <-r.ctx.Done():
		return 0, r.ctx.Err()
	case <-r.input.done:
		select {
		case b := <-r.input.bytes:
			p[0] = b
			return 1, nil
		default:
		}
		return 0, r.input.err
	}
}

func (r *inputReader) Close() error {
	r.cancel()
	// Wait for a pending Read to release ownership before the prompt resumes.
	r.mu.Lock()
	r.mu.Unlock()
	return nil
}

package wpstream

import (
	"context"
	"io"
	"sync"
)

type stdinDestination interface {
	io.WriteCloser
	abort(error)
}

// stdinPump keeps a single source reader across attempts. Pending writes move
// to the next stream instead of letting an abandoned copier consume input.
type stdinPump struct {
	ctx     context.Context
	src     io.Reader
	start   sync.Once
	mu      sync.Mutex
	stream  stdinDestination
	changed chan struct{}
	ended   bool
}

func newStdinPump(ctx context.Context, src io.Reader, tty bool) *stdinPump {
	if tty && src != nil {
		src = crToLF{src}
	}
	return &stdinPump{ctx: ctx, src: src, changed: make(chan struct{}), ended: src == nil}
}

func (p *stdinPump) attach(stream stdinDestination) {
	p.mu.Lock()
	p.stream = stream
	ended := p.ended
	close(p.changed)
	p.changed = make(chan struct{})
	p.mu.Unlock()
	if ended {
		_ = stream.Close()
		return
	}
	p.start.Do(func() {
		go func() {
			_, _ = io.Copy(p, p.src)
			p.mu.Lock()
			p.ended = true
			stream := p.stream
			p.mu.Unlock()
			if stream != nil {
				_ = stream.Close()
			}
		}()
	})
}

func (p *stdinPump) detach(stream stdinDestination) {
	p.mu.Lock()
	if p.stream == stream {
		p.stream = nil
		close(p.changed)
		p.changed = make(chan struct{})
	}
	p.mu.Unlock()
	stream.abort(errRunDone)
}

func (p *stdinPump) Write(data []byte) (int, error) {
	written := 0
	for written < len(data) {
		if err := p.ctx.Err(); err != nil {
			return written, err
		}
		p.mu.Lock()
		stream, changed := p.stream, p.changed
		p.mu.Unlock()
		if stream == nil {
			select {
			case <-changed:
				continue
			case <-p.ctx.Done():
				return written, p.ctx.Err()
			}
		}
		n, err := stream.Write(data[written:])
		written += n
		if err != nil {
			p.detach(stream)
		}
	}
	return written, nil
}

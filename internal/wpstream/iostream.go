package wpstream

import (
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/google/uuid"
)

const streamEvent = "$stream" // socket.io-stream EVENT_NAME

// StreamSocket wraps a Client to provide the socket.io-stream subprotocol.
// Port of socket.io-stream/lib/socket.js.
type StreamSocket struct {
	cli *Client
	ctx context.Context

	mu       sync.Mutex
	streams  map[string]*IOStream
	handlers map[string][]func(args []any, ackID *int)
}

func NewStreamSocket(ctx context.Context, cli *Client) *StreamSocket {
	ss := &StreamSocket{
		cli: cli, ctx: ctx,
		streams:  map[string]*IOStream{},
		handlers: map[string][]func([]any, *int){},
	}
	cli.On(streamEvent, func(args []any) { ss.onStreamEvent(args) })
	cli.OnRaw(streamEvent+"-write", ss.onWrite) // needs ack id
	cli.On(streamEvent+"-read", func(a []any) { ss.onRead(a) })
	cli.On(streamEvent+"-end", func(a []any) { ss.onEnd(a) })
	cli.On(streamEvent+"-error", func(a []any) { ss.onError(a) })
	return ss
}

func (ss *StreamSocket) On(event string, h func(args []any, ackID *int)) {
	ss.mu.Lock()
	ss.handlers[event] = append(ss.handlers[event], h)
	ss.mu.Unlock()
}

func (ss *StreamSocket) CreateStream() *IOStream {
	s := newIOStream(ss, uuid.NewString())
	ss.register(s)
	return s
}

func (ss *StreamSocket) register(s *IOStream) {
	ss.mu.Lock()
	ss.streams[s.id] = s
	ss.mu.Unlock()
}

// cleanup removes a stream from the map (M2 — prevents leak across reconnects).
func (ss *StreamSocket) cleanup(id string) {
	ss.mu.Lock()
	delete(ss.streams, id)
	ss.mu.Unlock()
}

// abortAll snapshots the streams map and aborts each one (C3).
func (ss *StreamSocket) abortAll(err error) {
	ss.mu.Lock()
	snapshot := make([]*IOStream, 0, len(ss.streams))
	for _, s := range ss.streams {
		snapshot = append(snapshot, s)
	}
	ss.mu.Unlock()
	for _, s := range snapshot {
		s.abort(err)
	}
}

func (ss *StreamSocket) Emit(ctx context.Context, event string, args []any, ack func([]any)) error {
	enc := make([]any, 0, len(args))
	for _, a := range args {
		enc = append(enc, ss.encodeArg(a))
	}
	full := append([]any{event}, enc...)
	return ss.cli.Emit(ctx, streamEvent, full, ack)
}

func (ss *StreamSocket) encodeArg(v any) any {
	switch t := v.(type) {
	case *IOStream:
		ss.register(t)
		return map[string]any{"$stream": t.id}
	case []any:
		out := make([]any, len(t))
		for i, e := range t {
			out[i] = ss.encodeArg(e)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, e := range t {
			out[k] = ss.encodeArg(e)
		}
		return out
	default:
		return v
	}
}

func (ss *StreamSocket) decodeArg(v any) any {
	switch t := v.(type) {
	case map[string]any:
		if id, ok := t["$stream"].(string); ok && id != "" {
			s := newIOStream(ss, id)
			ss.register(s)
			return s
		}
		for k, e := range t {
			t[k] = ss.decodeArg(e)
		}
		return t
	case []any:
		for i, e := range t {
			t[i] = ss.decodeArg(e)
		}
		return t
	default:
		return v
	}
}

func (ss *StreamSocket) onStreamEvent(args []any) {
	if len(args) == 0 {
		return
	}
	event, _ := args[0].(string)
	rest := make([]any, 0, len(args)-1)
	for _, a := range args[1:] {
		rest = append(rest, ss.decodeArg(a))
	}
	ss.mu.Lock()
	hs := append([]func([]any, *int){}, ss.handlers[event]...)
	ss.mu.Unlock()
	// Dispatch user handlers in goroutines so the Client readLoop is not
	// blocked. If a handler calls io.ReadAll on an IOStream, it will itself
	// emit $stream-read credits, which must be processed by this same readLoop
	// — dispatching inline would deadlock.
	for _, h := range hs {
		h := h
		go h(rest, nil)
	}
}

func (ss *StreamSocket) sendRead(id string, size int) {
	_ = ss.cli.Emit(ss.ctx, streamEvent+"-read", []any{id, size}, nil)
}

// sendWrite sends a $stream-write packet. Returns any transport error (M1).
func (ss *StreamSocket) sendWrite(id string, chunk []byte, ack func([]any)) error {
	return ss.cli.Emit(ss.ctx, streamEvent+"-write",
		[]any{id, binaryArg(chunk), "buffer"}, ack)
}

func (ss *StreamSocket) sendEnd(id string) {
	_ = ss.cli.Emit(ss.ctx, streamEvent+"-end", []any{id}, nil)
}

func (ss *StreamSocket) get(id string) *IOStream {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	return ss.streams[id]
}

func (ss *StreamSocket) onRead(args []any) {
	id, _ := args[0].(string)
	if s := ss.get(id); s != nil {
		s.grantWriteCredit()
	}
}

func (ss *StreamSocket) onWrite(args []any, ackID *int) {
	id, _ := args[0].(string)
	var chunk []byte
	if b, ok := args[1].([]byte); ok {
		chunk = b
	}
	s := ss.get(id)
	if s == nil {
		return
	}
	// deliver blocks until the consumer reads — this is intentional backpressure.
	// The ack fires AFTER deliver returns (matching Node socket.io-stream semantics:
	// the callback fires after the consumer pulls). The readLoop goroutine may block
	// here, but since the ack is sent via WriteMessage (a buffered channel push to
	// the peer) and the peer's readLoop is independent, there is no circular wait.
	s.deliver(chunk)
	if ackID != nil {
		_ = ss.cli.ackReply(ss.ctx, *ackID, nil)
	}
}

func (ss *StreamSocket) onEnd(args []any) {
	id, _ := args[0].(string)
	if s := ss.get(id); s != nil {
		s.deliverEOF()
	}
}

func (ss *StreamSocket) onError(args []any) {
	id, _ := args[0].(string)
	msg := ""
	if len(args) > 1 {
		msg, _ = args[1].(string)
	}
	if s := ss.get(id); s != nil {
		s.abort(fmt.Errorf("wpstream: remote stream error: %s", msg))
	}
}

// IOStream is a duplex stream over the socket.io-stream subprotocol.
// It implements io.ReadWriteCloser.
//
// Flow control: reading triggers a $stream-read credit to the remote sender;
// the sender waits for that credit before flushing one chunk via $stream-write.
// Write blocks until a credit arrives (from the remote reader calling Read) and
// until the remote acknowledges receipt (ack from $stream-write handler).
//
// Teardown: abort(err) closes the `closed` channel, unblocking all blocked
// Read/Write/deliver calls. deliverEOF() is a normal end-of-stream; it uses a
// separate sync.Once-guarded readEOF channel so buffered data can still drain.
type IOStream struct {
	ss *StreamSocket
	id string

	readBuf  chan []byte
	readEOF  chan struct{}
	leftover []byte
	readReqd bool

	writeCredit chan struct{}

	// closed is closed once by abort() or by the explicit Close() teardown path.
	// It is the escape hatch for blocked Read/Write/deliver calls.
	closed    chan struct{}
	closeOnce sync.Once // guards close(closed) + cleanup
	abortErr  error     // set before close(closed); nil means normal close / EOF

	// eofOnce guards close(readEOF) so a duplicate $stream-end never panics (I2).
	eofOnce sync.Once

	// sendEndOnce ensures $stream-end is sent exactly once by Close().
	sendEndOnce sync.Once

	mu sync.Mutex
}

// Ensure IOStream satisfies io.ReadWriteCloser at compile time.
var _ io.ReadWriteCloser = (*IOStream)(nil)

func newIOStream(ss *StreamSocket, id string) *IOStream {
	return &IOStream{
		ss: ss, id: id,
		readBuf:     make(chan []byte, 1),
		readEOF:     make(chan struct{}),
		writeCredit: make(chan struct{}, 1),
		closed:      make(chan struct{}),
	}
}

// abort terminates the stream with the given error, unblocking all blocked
// Read/Write/deliver calls. Idempotent (I2, I3). Called on disconnect (C3)
// and on remote stream error.
func (s *IOStream) abort(err error) {
	s.closeOnce.Do(func() {
		s.abortErr = err
		close(s.closed)
		s.ss.cleanup(s.id)
	})
}

// abortErrOrClosed returns the abort error, or io.ErrClosedPipe if the
// stream was closed without an error (normal Close path).
func (s *IOStream) abortErrOrClosed() error {
	if s.abortErr != nil {
		return s.abortErr
	}
	return io.ErrClosedPipe
}

// Read implements io.Reader. On the first call (or after consuming a previous
// chunk) it sends a $stream-read credit to the remote, then blocks until a
// chunk, EOF, or error arrives. Also unblocks when the stream is aborted (I3).
func (s *IOStream) Read(p []byte) (int, error) {
	if len(s.leftover) > 0 {
		n := copy(p, s.leftover)
		s.leftover = s.leftover[n:]
		return n, nil
	}
	s.mu.Lock()
	if !s.readReqd {
		s.readReqd = true
		s.mu.Unlock()
		s.ss.sendRead(s.id, len(p))
	} else {
		s.mu.Unlock()
	}
	select {
	case chunk := <-s.readBuf:
		s.mu.Lock()
		s.readReqd = false
		s.mu.Unlock()
		n := copy(p, chunk)
		if n < len(chunk) {
			s.leftover = chunk[n:]
		}
		return n, nil
	case <-s.readEOF:
		return 0, io.EOF
	case <-s.closed:
		// drain any chunk that raced with abort
		select {
		case chunk := <-s.readBuf:
			s.mu.Lock()
			s.readReqd = false
			s.mu.Unlock()
			n := copy(p, chunk)
			if n < len(chunk) {
				s.leftover = chunk[n:]
			}
			return n, nil
		default:
		}
		return 0, s.abortErrOrClosed()
	}
}

// deliver pushes one chunk into the read buffer. Called by onWrite on the
// readLoop goroutine. Does not block forever after abort (I2).
func (s *IOStream) deliver(chunk []byte) {
	select {
	case s.readBuf <- chunk:
	case <-s.closed:
	}
}

// deliverEOF signals EOF to any blocked Read call. Idempotent (I2).
func (s *IOStream) deliverEOF() {
	s.eofOnce.Do(func() { close(s.readEOF) })
}

// grantWriteCredit unblocks one pending Write call.
func (s *IOStream) grantWriteCredit() {
	select {
	case s.writeCredit <- struct{}{}:
	default:
	}
}

// Write implements io.Writer. Blocks until a read-credit arrives from the
// remote (i.e., the remote called Read, which sent $stream-read), then sends
// the chunk and blocks until the remote ACKs receipt.
// Both waits are escapable via the closed channel (I3). Emit errors are
// propagated (M1).
func (s *IOStream) Write(p []byte) (int, error) {
	select {
	case <-s.writeCredit:
	case <-s.closed:
		return 0, s.abortErrOrClosed()
	}
	acked := make(chan struct{})
	if err := s.ss.sendWrite(s.id, p, func([]any) { close(acked) }); err != nil {
		return 0, err
	}
	select {
	case <-acked:
	case <-s.closed:
		return 0, s.abortErrOrClosed()
	}
	return len(p), nil
}

// Close implements io.Closer. Sends $stream-end exactly once and marks the
// stream closed. Idempotent.
func (s *IOStream) Close() error {
	s.sendEndOnce.Do(func() { s.ss.sendEnd(s.id) })
	// Also mark closed so any concurrent Write/Read unblocks (I3).
	s.closeOnce.Do(func() {
		// abortErr stays nil → abortErrOrClosed returns io.ErrClosedPipe.
		close(s.closed)
		s.ss.cleanup(s.id)
	})
	return nil
}

package wpstream

import (
	"bytes"
	"context"
	"io"
	"testing"
	"time"
)

// pipeTransport is an in-memory transport pair for loopback tests.
// WriteMessage/WriteBinary push packets onto the PEER's inbound channel,
// exactly mirroring what Engine.Read would return after stripping the EIO framing.
type pipeTransport struct {
	peer *pipeTransport
	in   chan Packet
}

func (p *pipeTransport) Read(ctx context.Context) (Packet, error) {
	select {
	case pkt := <-p.in:
		return pkt, nil
	case <-ctx.Done():
		return Packet{}, ctx.Err()
	}
}

// WriteMessage receives the raw socket.io packet string (Client.sendPacket
// passes f.Data which is the sio string; real Engine.WriteMessage adds the
// '4' prefix). We deliver to the peer as Packet{Type: eioMessage, Data: copy}
// which is exactly what Engine.Read returns after stripping the '4'.
func (p *pipeTransport) WriteMessage(ctx context.Context, payload []byte) error {
	buf := make([]byte, len(payload))
	copy(buf, payload)
	select {
	case p.peer.in <- Packet{Type: eioMessage, Data: buf}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// WriteBinary receives raw binary attachment bytes. We deliver to the peer as
// Packet{Binary: true, Data: copy}, matching what Engine.Read returns for a
// WebSocket binary frame.
func (p *pipeTransport) WriteBinary(ctx context.Context, data []byte) error {
	buf := make([]byte, len(data))
	copy(buf, data)
	select {
	case p.peer.in <- Packet{Type: eioMessage, Data: buf, Binary: true}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// newLoopbackStreamSockets builds an in-memory loopback: two pipeTransports
// cross-linked, two Clients with their readLoops running, wrapped in StreamSockets.
// No Connect handshake is needed — we skip directly to readLoop.
func newLoopbackStreamSockets(t *testing.T) (*StreamSocket, *StreamSocket) {
	t.Helper()

	ta := &pipeTransport{in: make(chan Packet, 64)}
	tb := &pipeTransport{in: make(chan Packet, 64)}
	ta.peer = tb
	tb.peer = ta

	cliA := NewClient(ta, "/wp-cli")
	cliB := NewClient(tb, "/wp-cli")

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	go cliA.readLoop(ctx)
	go cliB.readLoop(ctx)

	a := NewStreamSocket(ctx, cliA)
	b := NewStreamSocket(ctx, cliB)
	return a, b
}

func TestStreamReadFromRemote(t *testing.T) {
	a, b := newLoopbackStreamSockets(t)

	bStream := b.CreateStream()
	got := make(chan []byte, 1)
	a.On("cmd", func(args []any, _ *int) {
		s := args[len(args)-1].(*IOStream)
		data, _ := io.ReadAll(s)
		got <- data
	})

	ctx := context.Background()
	if err := b.Emit(ctx, "cmd", []any{"meta", bStream}, nil); err != nil {
		t.Fatal(err)
	}
	go func() {
		_, _ = bStream.Write([]byte("hello"))
		_ = bStream.Close()
	}()

	select {
	case d := <-got:
		if !bytes.Equal(d, []byte("hello")) {
			t.Errorf("read = %q", d)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout reading remote stream")
	}
}

func TestStreamWriteToRemote(t *testing.T) {
	a, b := newLoopbackStreamSockets(t)
	aStream := a.CreateStream()

	done := make(chan []byte, 1)
	b.On("cmd", func(args []any, _ *int) {
		s := args[len(args)-1].(*IOStream)
		data, _ := io.ReadAll(s)
		done <- data
	})
	ctx := context.Background()
	if err := a.Emit(ctx, "cmd", []any{"meta", aStream}, nil); err != nil {
		t.Fatal(err)
	}
	go func() {
		_, _ = aStream.Write([]byte("from-a"))
		_ = aStream.Close()
	}()
	select {
	case d := <-done:
		if !bytes.Equal(d, []byte("from-a")) {
			t.Errorf("got %q", d)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout")
	}
}

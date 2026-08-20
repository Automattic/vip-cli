package wpstream

import (
	"bytes"
	"context"
	"encoding/json/v2"
	"fmt"
	"strconv"
	"sync"
	"sync/atomic"
)

// Socket.IO v4 packet types (socket.io-parser, protocol 5).
const (
	sioConnect      = 0
	sioDisconnect   = 1
	sioEvent        = 2
	sioAck          = 3
	sioConnectError = 4
	sioBinaryEvent  = 5
	sioBinaryAck    = 6
)

// binaryArg wraps a []byte so the encoder emits it as a socket.io binary
// attachment (placeholder + separate frame) rather than JSON.
type binaryArg []byte

// sioPacket is a decoded/decodable Socket.IO packet.
type sioPacket struct {
	Type        int
	Nsp         string
	ID          *int  // ack id
	Data        []any // event name + args (decoded; binary args are []byte)
	attachments int   // BINARY_* only
}

func intPtr(i int) *int { return &i }

// encodePacket renders a packet to one text frame plus N binary frames.
func encodePacket(p sioPacket) ([]Packet, error) {
	typ := p.Type
	var attachments [][]byte
	data := p.Data

	if hasBinary(data) {
		switch typ {
		case sioEvent:
			typ = sioBinaryEvent
		case sioAck:
			typ = sioBinaryAck
		}
		deconstructed, bufs := deconstruct(data)
		data, _ = deconstructed.([]any)
		attachments = bufs
	}

	var b bytes.Buffer
	b.WriteString(strconv.Itoa(typ))
	if typ == sioBinaryEvent || typ == sioBinaryAck {
		b.WriteString(strconv.Itoa(len(attachments)))
		b.WriteByte('-')
	}
	if p.Nsp != "" && p.Nsp != "/" {
		b.WriteString(p.Nsp)
		b.WriteByte(',')
	}
	if p.ID != nil {
		b.WriteString(strconv.Itoa(*p.ID))
	}
	if data != nil {
		j, err := json.Marshal(data)
		if err != nil {
			return nil, err
		}
		b.Write(j)
	}

	frames := []Packet{{Type: eioMessage, Data: b.Bytes()}}
	for _, a := range attachments {
		frames = append(frames, Packet{Type: eioMessage, Data: a, Binary: true})
	}
	return frames, nil
}

func hasBinary(v any) bool {
	switch t := v.(type) {
	case binaryArg:
		return true
	case []any:
		for _, e := range t {
			if hasBinary(e) {
				return true
			}
		}
	case map[string]any:
		for _, e := range t {
			if hasBinary(e) {
				return true
			}
		}
	}
	return false
}

// deconstruct walks data, replacing each binaryArg with a placeholder and
// collecting the raw bytes (socket.io-parser binary.js).
func deconstruct(v any) (any, [][]byte) {
	var bufs [][]byte
	var walk func(any) any
	walk = func(x any) any {
		switch t := x.(type) {
		case binaryArg:
			ph := map[string]any{"_placeholder": true, "num": len(bufs)}
			bufs = append(bufs, []byte(t))
			return ph
		case []any:
			out := make([]any, len(t))
			for i, e := range t {
				out[i] = walk(e)
			}
			return out
		case map[string]any:
			out := make(map[string]any, len(t))
			for k, e := range t {
				out[k] = walk(e)
			}
			return out
		default:
			return x
		}
	}
	return walk(v), bufs
}

// sioDecoder reassembles packets, buffering binary attachments.
type sioDecoder struct {
	pending    *sioPacket
	placeholds int
	bufs       [][]byte
}

func newSioDecoder() *sioDecoder { return &sioDecoder{} }

// add feeds one Engine.IO packet. Returns (packet, true) when a full Socket.IO
// packet is assembled, or (_, false) while awaiting binary attachments.
func (d *sioDecoder) add(pkt Packet) (sioPacket, bool, error) {
	if pkt.Binary {
		if d.pending == nil {
			return sioPacket{}, false, fmt.Errorf("wpstream: unexpected binary frame")
		}
		d.bufs = append(d.bufs, pkt.Data)
		if len(d.bufs) < d.placeholds {
			return sioPacket{}, false, nil
		}
		p := *d.pending
		p.Data = reconstruct(p.Data, d.bufs).([]any)
		d.pending, d.placeholds, d.bufs = nil, 0, nil
		return p, true, nil
	}

	p, attachments, err := decodeString(pkt.Data)
	if err != nil {
		return sioPacket{}, false, err
	}
	if attachments == 0 {
		return p, true, nil
	}
	d.pending, d.placeholds, d.bufs = &p, attachments, nil
	return sioPacket{}, false, nil
}

// decodeString parses the text portion. Returns the packet plus the number of
// expected binary attachments.
func decodeString(b []byte) (sioPacket, int, error) {
	if len(b) == 0 {
		return sioPacket{}, 0, fmt.Errorf("wpstream: empty packet")
	}
	i := 0
	typ := int(b[i] - '0')
	i++
	attachments := 0
	if typ == sioBinaryEvent || typ == sioBinaryAck {
		j := i
		for j < len(b) && b[j] != '-' {
			j++
		}
		n, _ := strconv.Atoi(string(b[i:j]))
		attachments = n
		i = j + 1
	}
	nsp := "/"
	if i < len(b) && b[i] == '/' {
		j := i
		for j < len(b) && b[j] != ',' {
			j++
		}
		nsp = string(b[i:j])
		if j < len(b) {
			j++ // skip comma
		}
		i = j
	}
	var idp *int
	if i < len(b) && b[i] >= '0' && b[i] <= '9' {
		j := i
		for j < len(b) && b[j] >= '0' && b[j] <= '9' {
			j++
		}
		id, _ := strconv.Atoi(string(b[i:j]))
		idp = &id
		i = j
	}
	p := sioPacket{Type: typ, Nsp: nsp, ID: idp, attachments: attachments}
	if i < len(b) {
		rest := b[i:]
		if len(rest) > 0 && rest[0] == '[' {
			// EVENT / ACK: JSON array of [eventName, ...args]
			var data []any
			if err := json.Unmarshal(rest, &data); err != nil {
				return sioPacket{}, 0, fmt.Errorf("wpstream: decode data: %w", err)
			}
			p.Data = data
		} else {
			// CONNECT / CONNECT_ERROR: JSON object payload, store as single element.
			var obj any
			if err := json.Unmarshal(rest, &obj); err != nil {
				return sioPacket{}, 0, fmt.Errorf("wpstream: decode data: %w", err)
			}
			p.Data = []any{obj}
		}
	}
	return p, attachments, nil
}

// reconstruct replaces {"_placeholder":true,"num":N} markers with bufs[N].
func reconstruct(v any, bufs [][]byte) any {
	switch t := v.(type) {
	case map[string]any:
		if ph, _ := t["_placeholder"].(bool); ph {
			if num, ok := t["num"].(float64); ok && int(num) < len(bufs) {
				return bufs[int(num)]
			}
		}
		for k, e := range t {
			t[k] = reconstruct(e, bufs)
		}
		return t
	case []any:
		for i, e := range t {
			t[i] = reconstruct(e, bufs)
		}
		return t
	default:
		return v
	}
}

// transport is the Engine.IO interface that Client writes to and reads from.
// *Engine satisfies it; tests may substitute an in-memory loopback (Task 3).
type transport interface {
	Read(ctx context.Context) (Packet, error)
	WriteMessage(ctx context.Context, payload []byte) error
	WriteBinary(ctx context.Context, data []byte) error
}

// Client is a Socket.IO v4 namespace client over a transport.
type Client struct {
	eng transport
	nsp string
	dec *sioDecoder

	mu          sync.Mutex
	handlers    map[string][]func(args []any)
	rawHandlers map[string][]func(args []any, ackID *int)
	ackID       atomic.Int64
	acks        map[int]func(args []any)
	connected   chan struct{}
	connErr     chan error
}

// NewClient creates a Socket.IO namespace client over the given transport.
func NewClient(eng transport, nsp string) *Client {
	return &Client{
		eng: eng, nsp: nsp, dec: newSioDecoder(),
		handlers:    map[string][]func([]any){},
		rawHandlers: map[string][]func([]any, *int){},
		acks:        map[int]func([]any){},
		connected:   make(chan struct{}), connErr: make(chan error, 1),
	}
}

// On registers a handler for the named event.
func (c *Client) On(event string, h func(args []any)) {
	c.mu.Lock()
	c.handlers[event] = append(c.handlers[event], h)
	c.mu.Unlock()
}

// OnRaw registers a handler for the named event that also receives the ack id.
// Raw handlers fire before plain On handlers. The iostream layer uses this to
// send ACK replies for $stream-write events.
func (c *Client) OnRaw(event string, h func(args []any, ackID *int)) {
	c.mu.Lock()
	c.rawHandlers[event] = append(c.rawHandlers[event], h)
	c.mu.Unlock()
}

// Emit sends an event to the server. If ack is non-nil the packet carries an
// ack id and ack will be called when the server replies.
func (c *Client) Emit(ctx context.Context, event string, args []any, ack func([]any)) error {
	p := sioPacket{Type: sioEvent, Nsp: c.nsp, Data: append([]any{event}, args...)}
	if ack != nil {
		id := int(c.ackID.Add(1))
		p.ID = &id
		c.mu.Lock()
		c.acks[id] = ack
		c.mu.Unlock()
	}
	return c.sendPacket(ctx, p)
}

// ackReply sends a Socket.IO ACK for a previously received event id.
func (c *Client) ackReply(ctx context.Context, id int, args []any) error {
	return c.sendPacket(ctx, sioPacket{Type: sioAck, Nsp: c.nsp, ID: &id, Data: args})
}

func (c *Client) sendPacket(ctx context.Context, p sioPacket) error {
	frames, err := encodePacket(p)
	if err != nil {
		return err
	}
	for _, f := range frames {
		if f.Binary {
			if err := c.eng.WriteBinary(ctx, f.Data); err != nil {
				return err
			}
			continue
		}
		if err := c.eng.WriteMessage(ctx, f.Data); err != nil {
			return err
		}
	}
	return nil
}

// Connect sends the namespace CONNECT packet and waits for the server CONNECT
// ack, then starts the read loop in a background goroutine.
func (c *Client) Connect(ctx context.Context) error {
	if err := c.sendPacket(ctx, sioPacket{Type: sioConnect, Nsp: c.nsp}); err != nil {
		return err
	}
	go c.readLoop(ctx)
	select {
	case <-c.connected:
		return nil
	case err := <-c.connErr:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c *Client) readLoop(ctx context.Context) {
	for {
		pkt, err := c.eng.Read(ctx)
		if err != nil {
			c.dispatch("disconnect", []any{err.Error()})
			return
		}
		p, complete, derr := c.dec.add(pkt)
		if derr != nil || !complete {
			continue
		}
		c.handlePacket(ctx, p)
	}
}

func (c *Client) handlePacket(ctx context.Context, p sioPacket) {
	switch p.Type {
	case sioConnect:
		select {
		case <-c.connected:
		default:
			close(c.connected)
		}
	case sioConnectError:
		select {
		case c.connErr <- fmt.Errorf("wpstream: connect_error: %v", p.Data):
		default:
		}
	case sioEvent, sioBinaryEvent:
		if len(p.Data) == 0 {
			return
		}
		event, _ := p.Data[0].(string)
		args := p.Data[1:]
		c.dispatchWithAck(ctx, event, args, p.ID)
	case sioAck, sioBinaryAck:
		if p.ID == nil {
			return
		}
		c.mu.Lock()
		ack := c.acks[*p.ID]
		delete(c.acks, *p.ID)
		c.mu.Unlock()
		if ack != nil {
			ack(p.Data)
		}
	case sioDisconnect:
		c.dispatch("disconnect", nil)
	}
}

func (c *Client) dispatch(event string, args []any) {
	c.mu.Lock()
	hs := append([]func([]any){}, c.handlers[event]...)
	c.mu.Unlock()
	for _, h := range hs {
		h(args)
	}
}

// dispatchWithAck delivers an event, invoking raw handlers (with the ack id)
// before plain handlers. The iostream layer registers $stream-write via OnRaw
// and sends the ack itself; nothing is auto-acked here.
func (c *Client) dispatchWithAck(ctx context.Context, event string, args []any, id *int) {
	c.mu.Lock()
	rhs := append([]func([]any, *int){}, c.rawHandlers[event]...)
	c.mu.Unlock()
	for _, h := range rhs {
		h(args, id)
	}
	c.dispatch(event, args)
	_ = ctx
}

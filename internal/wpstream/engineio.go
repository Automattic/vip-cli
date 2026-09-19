// Package wpstream is a hand-rolled Engine.IO v4 + Socket.IO v4 +
// socket.io-stream client. It ports the socket.io transport used by
// src/bin/vip-wp.js for the wpcliStrategy=websocket WP-CLI strategy.
//
// engineio.go is the bottom layer: the Engine.IO v4 transport. It does the
// HTTP long-poll handshake, upgrades to WebSocket, answers server pings, and
// exposes a packet-level duplex to the Socket.IO codec above it.
package wpstream

import (
	"context"
	"encoding/json/v2"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/Automattic/vip/internal/httpproxy"
)

// Engine.IO v4 packet type chars (engine.io-parser commons.js).
const (
	eioOpen    = '0'
	eioClose   = '1'
	eioPing    = '2'
	eioPong    = '3'
	eioMessage = '4'
	eioUpgrade = '5'
	eioNoop    = '6'
)

// Packet is one Engine.IO packet. For text packets Type is the type char and
// Data is the payload after it. For raw binary frames (socket.io attachments)
// Binary is true, Type is eioMessage by convention, and Data holds the bytes.
type Packet struct {
	Type   byte
	Data   []byte
	Binary bool
}

// DialOptions configure the Engine.IO connection.
type DialOptions struct {
	BaseURL string      // e.g. https://api.wpvip.com (no trailing /socket.io/)
	Header  http.Header // extraHeaders carried on BOTH transports (Bearer token)
	Client  *http.Client
}

type openPacket struct {
	SID          string   `json:"sid"`
	Upgrades     []string `json:"upgrades"`
	PingInterval int      `json:"pingInterval"`
	PingTimeout  int      `json:"pingTimeout"`
}

// Engine is a connected Engine.IO transport (after the websocket upgrade).
// A background read loop dispatches incoming frames: pings are answered
// immediately, non-ping packets are queued on recvCh for Read callers.
type Engine struct {
	ws           *websocket.Conn
	sid          string
	pingInterval time.Duration
	pingTimeout  time.Duration

	recvCh chan Packet
	errCh  chan error // closed / first error from the read loop

	mu         sync.Mutex
	closeOnce  sync.Once
	closed     chan struct{}
	readCancel context.CancelFunc // cancels the readLoop context (I1)
}

func (e *Engine) SID() string { return e.sid }

// Dial performs the polling handshake then upgrades to WebSocket.
func Dial(ctx context.Context, opts DialOptions) (*Engine, error) {
	client := opts.Client
	if client == nil {
		// vip-wp.js:539 passes createProxyAgent(API_HOST) to the socket.io
		// client, so this transport is proxied on Node too — but by Node's
		// policy, not http.DefaultTransport's. See internal/httpproxy.
		client = httpproxy.Client()
	}

	// 1. Polling handshake: GET /socket.io/?EIO=4&transport=polling
	open, err := pollingHandshake(ctx, client, opts)
	if err != nil {
		return nil, err
	}

	// 2. WebSocket upgrade with sid.
	wsURL := buildURL(opts.BaseURL, "websocket", open.SID)
	c, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPClient: client,
		HTTPHeader: opts.Header,
	})
	if err != nil {
		return nil, fmt.Errorf("wpstream: websocket dial: %w", err)
	}
	c.SetReadLimit(-1) // server controls payload size; no client cap

	// 3. Probe: send "2probe", expect "3probe", send "5".
	if err := c.Write(ctx, websocket.MessageText, []byte("2probe")); err != nil {
		return nil, err
	}
	_, resp, err := c.Read(ctx)
	if err != nil || string(resp) != "3probe" {
		return nil, fmt.Errorf("wpstream: bad probe reply %q (%v)", resp, err)
	}
	if err := c.Write(ctx, websocket.MessageText, []byte{eioUpgrade}); err != nil {
		return nil, err
	}

	// I1: derive a cancelable context so Close() can stop readLoop.
	readCtx, readCancel := context.WithCancel(context.Background())

	eng := &Engine{
		ws:           c,
		sid:          open.SID,
		pingInterval: time.Duration(open.PingInterval) * time.Millisecond,
		pingTimeout:  time.Duration(open.PingTimeout) * time.Millisecond,
		recvCh:       make(chan Packet, 64),
		errCh:        make(chan error, 1),
		closed:       make(chan struct{}),
		readCancel:   readCancel,
	}
	go eng.readLoop(readCtx)
	return eng, nil
}

// readLoop is the single goroutine that owns the websocket read side.
// It answers server pings immediately (serialized through the write mutex)
// and queues all other packets onto recvCh.
// I1: ctx is derived from a cancelable context created in Dial; Close() cancels
// it, which unblocks e.ws.Read and terminates the goroutine cleanly.
func (e *Engine) readLoop(ctx context.Context) {
	defer close(e.errCh)
	for {
		typ, data, err := e.ws.Read(ctx)
		if err != nil {
			select {
			case e.errCh <- err:
			default:
			}
			return
		}
		if typ == websocket.MessageBinary {
			select {
			case e.recvCh <- Packet{Type: eioMessage, Data: data, Binary: true}:
			case <-e.closed:
				return
			}
			continue
		}
		if len(data) == 0 {
			continue
		}
		switch data[0] {
		case eioPing:
			// Server-initiated heartbeat: reply with pong immediately.
			_ = e.write(context.Background(), websocket.MessageText, []byte{eioPong})
		case eioNoop:
			// skip
		case eioClose:
			select {
			case e.errCh <- io.EOF:
			default:
			}
			return
		default:
			select {
			case e.recvCh <- Packet{Type: data[0], Data: data[1:]}:
			case <-e.closed:
				return
			}
		}
	}
}

func pollingHandshake(ctx context.Context, client *http.Client, opts DialOptions) (*openPacket, error) {
	u := buildURL(opts.BaseURL, "polling", "")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	for k, vs := range opts.Header {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("wpstream: polling handshake: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	// First packet of the (possibly \x1e-joined) payload is the open packet.
	first := body
	if i := strings.IndexByte(string(body), '\x1e'); i >= 0 {
		first = body[:i]
	}
	if len(first) == 0 || first[0] != eioOpen {
		return nil, fmt.Errorf("wpstream: expected open packet, got %q", first)
	}
	var op openPacket
	if err := json.Unmarshal(first[1:], &op); err != nil {
		return nil, fmt.Errorf("wpstream: parse open packet: %w", err)
	}
	return &op, nil
}

// buildURL constructs <base>/socket.io/?EIO=4&transport=<t>[&sid=<sid>]
// with ws/wss scheme for the websocket transport.
func buildURL(base, transport, sid string) string {
	u, _ := url.Parse(base)
	u.Path = strings.TrimRight(u.Path, "/") + "/socket.io/"
	if transport == "websocket" {
		switch u.Scheme {
		case "https":
			u.Scheme = "wss"
		case "http":
			u.Scheme = "ws"
		}
	}
	q := u.Query()
	q.Set("EIO", "4")
	q.Set("transport", transport)
	if sid != "" {
		q.Set("sid", sid)
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// Read returns the next non-heartbeat packet. Blocks until a packet arrives,
// the context is cancelled, or the connection is closed.
func (e *Engine) Read(ctx context.Context) (Packet, error) {
	select {
	case pkt, ok := <-e.recvCh:
		if !ok {
			return Packet{}, errClosed
		}
		return pkt, nil
	case err, ok := <-e.errCh:
		if !ok {
			return Packet{}, errClosed
		}
		return Packet{}, err
	case <-ctx.Done():
		return Packet{}, ctx.Err()
	case <-e.closed:
		return Packet{}, errClosed
	}
}

// WriteMessage sends a Socket.IO message packet ("4" + payload).
func (e *Engine) WriteMessage(ctx context.Context, payload []byte) error {
	frame := append([]byte{eioMessage}, payload...)
	return e.write(ctx, websocket.MessageText, frame)
}

// WriteBinary sends a raw binary attachment frame (EIO4: no type prefix).
func (e *Engine) WriteBinary(ctx context.Context, data []byte) error {
	return e.write(ctx, websocket.MessageBinary, data)
}

func (e *Engine) write(ctx context.Context, typ websocket.MessageType, data []byte) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.ws.Write(ctx, typ, data)
}

func (e *Engine) Close() error {
	e.closeOnce.Do(func() {
		// I1: cancel the readLoop context so ws.Read unblocks immediately.
		e.readCancel()
		close(e.closed)
	})
	return e.ws.Close(websocket.StatusNormalClosure, "")
}

var errClosed = errors.New("wpstream: engine closed")

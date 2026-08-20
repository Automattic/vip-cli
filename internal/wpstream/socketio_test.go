package wpstream

import (
	"bytes"
	"context"
	"encoding/json/v2"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// ── codec tests ──────────────────────────────────────────────────────────────

func TestEncodeStringEvent(t *testing.T) {
	p := sioPacket{Type: sioEvent, Nsp: "/wp-cli", Data: []any{"x", map[string]any{"a": float64(1)}}}
	frames, err := encodePacket(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(frames) != 1 || frames[0].Binary {
		t.Fatalf("frames = %+v", frames)
	}
	if got := string(frames[0].Data); got != `2/wp-cli,["x",{"a":1}]` {
		t.Errorf("encoded = %q", got)
	}
}

func TestEncodeEventWithAckID(t *testing.T) {
	p := sioPacket{Type: sioEvent, Nsp: "/wp-cli", ID: intPtr(7), Data: []any{"ev"}}
	frames, _ := encodePacket(p)
	if got := string(frames[0].Data); got != `2/wp-cli,7["ev"]` {
		t.Errorf("encoded = %q", got)
	}
}

func TestEncodeBinaryEvent(t *testing.T) {
	chunk := []byte{0xde, 0xad}
	p := sioPacket{Type: sioEvent, Nsp: "/wp-cli", ID: intPtr(3),
		Data: []any{"$stream-write", "sid", binaryArg(chunk), "buffer"}}
	frames, err := encodePacket(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(frames) != 2 {
		t.Fatalf("want 2 frames, got %d", len(frames))
	}
	const prefix = `51-/wp-cli,3`
	if !bytes.HasPrefix(frames[0].Data, []byte(prefix)) {
		t.Fatalf("header = %q, want prefix %q", frames[0].Data, prefix)
	}
	var payload []any
	if err := json.Unmarshal(frames[0].Data[len(prefix):], &payload); err != nil {
		t.Fatalf("decode header payload: %v", err)
	}
	if len(payload) != 4 || payload[0] != "$stream-write" || payload[1] != "sid" || payload[3] != "buffer" {
		t.Fatalf("header payload = %#v", payload)
	}
	placeholder, ok := payload[2].(map[string]any)
	if !ok || len(placeholder) != 2 {
		t.Fatalf("placeholder = %#v", payload[2])
	}
	if marker, ok := placeholder["_placeholder"].(bool); !ok || !marker {
		t.Errorf("placeholder marker = %#v", placeholder["_placeholder"])
	}
	if num, ok := placeholder["num"].(float64); !ok || num != 0 {
		t.Errorf("placeholder number = %#v", placeholder["num"])
	}
	if !frames[1].Binary || !bytes.Equal(frames[1].Data, chunk) {
		t.Errorf("attachment frame = %+v", frames[1])
	}
}

func TestDecodeStringEvent(t *testing.T) {
	d := newSioDecoder()
	p, complete, err := d.add(Packet{Type: '4', Data: []byte(`2/wp-cli,["exit",{"exitCode":0}]`)})
	if err != nil || !complete {
		t.Fatalf("complete=%v err=%v", complete, err)
	}
	if p.Type != sioEvent || p.Nsp != "/wp-cli" {
		t.Errorf("packet = %+v", p)
	}
	if p.Data[0] != "exit" {
		t.Errorf("event = %v", p.Data[0])
	}
}

func TestDecodeBinaryEventReassembly(t *testing.T) {
	d := newSioDecoder()
	p, complete, err := d.add(Packet{Type: '4',
		Data: []byte(`51-/wp-cli,["$stream-write","sid",{"_placeholder":true,"num":0},"buffer"]`)})
	if err != nil {
		t.Fatal(err)
	}
	if complete {
		t.Fatal("must wait for the binary attachment")
	}
	p, complete, err = d.add(Packet{Binary: true, Data: []byte{0x01, 0x02}})
	if err != nil || !complete {
		t.Fatalf("complete=%v err=%v", complete, err)
	}
	if p.Data[0] != "$stream-write" {
		t.Errorf("event = %v", p.Data[0])
	}
	got, ok := p.Data[2].([]byte)
	if !ok || !bytes.Equal(got, []byte{0x01, 0x02}) {
		t.Errorf("reassembled attachment = %v (%T)", p.Data[2], p.Data[2])
	}
}

// ── client tests ─────────────────────────────────────────────────────────────

// fakeSocketIOServer builds a test HTTP server that:
//  1. answers the EIO4 polling handshake
//  2. accepts the websocket upgrade + 2probe/5 dance
//  3. runs fn(ctx, wsConn) for the server-side socket.io logic
func fakeSocketIOServer(t *testing.T, fn func(ctx context.Context, c *websocket.Conn)) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/socket.io/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("transport") == "polling" {
			w.Header().Set("Content-Type", "text/plain; charset=UTF-8")
			_, _ = w.Write([]byte(`0{"sid":"abc","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`))
			return
		}
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			t.Logf("ws accept: %v", err)
			return
		}
		defer c.Close(websocket.StatusNormalClosure, "")
		ctx := r.Context()
		// EIO4 probe dance
		_, probe, _ := c.Read(ctx)
		if string(probe) != "2probe" {
			t.Errorf("probe = %q", probe)
		}
		_ = c.Write(ctx, websocket.MessageText, []byte("3probe"))
		_, up, _ := c.Read(ctx)
		if string(up) != "5" {
			t.Errorf("upgrade = %q", up)
		}
		fn(ctx, c)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// sendSIO writes a text Socket.IO packet wrapped in EIO "4" envelope.
func sendSIO(ctx context.Context, c *websocket.Conn, payload string) error {
	return c.Write(ctx, websocket.MessageText, []byte("4"+payload))
}

// readSIOPacket reads one EIO text frame and strips the leading "4".
func readSIOPacket(ctx context.Context, c *websocket.Conn) (string, error) {
	_, b, err := c.Read(ctx)
	if err != nil {
		return "", err
	}
	if len(b) == 0 || b[0] != '4' {
		return "", fmt.Errorf("expected EIO message frame, got %q", b)
	}
	return string(b[1:]), nil
}

func TestClientConnectAndEvent(t *testing.T) {
	exitFired := make(chan float64, 1)

	srv := fakeSocketIOServer(t, func(ctx context.Context, c *websocket.Conn) {
		// Read client CONNECT for /wp-cli
		raw, err := readSIOPacket(ctx, c)
		if err != nil {
			t.Errorf("reading client CONNECT: %v", err)
			return
		}
		if raw != "0/wp-cli," {
			t.Errorf("client CONNECT = %q, want %q", raw, "0/wp-cli,")
		}

		// Send CONNECT ack
		_ = sendSIO(ctx, c, `0/wp-cli,{"sid":"s1"}`)

		// Send EVENT: exit with exitCode 0
		_ = sendSIO(ctx, c, `2/wp-cli,["exit",{"exitCode":0}]`)

		// Hold the connection open briefly so the client can process.
		time.Sleep(50 * time.Millisecond)
	})

	eng, err := Dial(context.Background(), DialOptions{BaseURL: srv.URL})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer eng.Close()

	cl := NewClient(eng, "/wp-cli")
	cl.On("exit", func(args []any) {
		if m, ok := args[0].(map[string]any); ok {
			if code, ok := m["exitCode"].(float64); ok {
				exitFired <- code
			}
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := cl.Connect(ctx); err != nil {
		t.Fatalf("Connect: %v", err)
	}

	select {
	case code := <-exitFired:
		if code != 0 {
			t.Errorf("exitCode = %v, want 0", code)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout: exit handler never fired")
	}
}

func TestClientOnRawReceivesAckID(t *testing.T) {
	rawFired := make(chan *int, 1)

	srv := fakeSocketIOServer(t, func(ctx context.Context, c *websocket.Conn) {
		// Read client CONNECT
		_, _ = readSIOPacket(ctx, c)

		// Send CONNECT ack
		_ = sendSIO(ctx, c, `0/wp-cli,{"sid":"s2"}`)

		// Send EVENT with ack id 42
		_ = sendSIO(ctx, c, `2/wp-cli,42["$stream-write","somearg"]`)

		time.Sleep(100 * time.Millisecond)
	})

	eng, err := Dial(context.Background(), DialOptions{BaseURL: srv.URL})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer eng.Close()

	cl := NewClient(eng, "/wp-cli")
	cl.OnRaw("$stream-write", func(args []any, ackID *int) {
		rawFired <- ackID
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := cl.Connect(ctx); err != nil {
		t.Fatalf("Connect: %v", err)
	}

	select {
	case id := <-rawFired:
		if id == nil {
			t.Fatal("ackID is nil, expected 42")
		}
		if *id != 42 {
			t.Errorf("ackID = %d, want 42", *id)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout: OnRaw handler never fired")
	}
}

// TestClientEmitAck verifies that Emit with an ack callback receives the reply.
func TestClientEmitAck(t *testing.T) {
	ackReceived := make(chan []any, 1)

	srv := fakeSocketIOServer(t, func(ctx context.Context, c *websocket.Conn) {
		// Read client CONNECT
		_, _ = readSIOPacket(ctx, c)

		// Send CONNECT ack
		_ = sendSIO(ctx, c, `0/wp-cli,{"sid":"s3"}`)

		// Read the Emit frame
		raw, err := readSIOPacket(ctx, c)
		if err != nil {
			t.Errorf("reading emit: %v", err)
			return
		}
		// Decode the ack id from the packet (e.g. "2/wp-cli,1["ping"]")
		// Simple approach: just parse the ack from it.
		// For test purposes decode enough to get the ack id.
		d := newSioDecoder()
		pkt, complete, derr := d.add(Packet{Type: eioMessage, Data: []byte(raw)})
		if derr != nil || !complete {
			t.Errorf("decode emit: err=%v complete=%v", derr, complete)
			return
		}
		if pkt.ID == nil {
			t.Error("no ack id in emitted packet")
			return
		}
		// Send ACK back: "3/wp-cli,<id>["pong"]"
		ackPkt := fmt.Sprintf(`3/wp-cli,%d["pong"]`, *pkt.ID)
		_ = sendSIO(ctx, c, ackPkt)

		time.Sleep(100 * time.Millisecond)
	})

	eng, err := Dial(context.Background(), DialOptions{BaseURL: srv.URL})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer eng.Close()

	cl := NewClient(eng, "/wp-cli")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := cl.Connect(ctx); err != nil {
		t.Fatalf("Connect: %v", err)
	}

	if err := cl.Emit(ctx, "ping", nil, func(args []any) {
		ackReceived <- args
	}); err != nil {
		t.Fatalf("Emit: %v", err)
	}

	select {
	case args := <-ackReceived:
		if len(args) == 0 || args[0] != "pong" {
			t.Errorf("ack args = %v, want [pong]", args)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout: ack never received")
	}
}

// TestClientAckReply verifies that ackReply sends a proper ACK packet.
func TestClientAckReply(t *testing.T) {
	ackRaw := make(chan string, 1)

	srv := fakeSocketIOServer(t, func(ctx context.Context, c *websocket.Conn) {
		// Read client CONNECT
		_, _ = readSIOPacket(ctx, c)
		_ = sendSIO(ctx, c, `0/wp-cli,{"sid":"s4"}`)

		// Send an event with ack id 99
		_ = sendSIO(ctx, c, `2/wp-cli,99["greet","hello"]`)

		// Read the ACK reply
		raw, err := readSIOPacket(ctx, c)
		if err != nil {
			t.Logf("reading ack reply: %v", err)
			return
		}
		ackRaw <- raw
	})

	eng, err := Dial(context.Background(), DialOptions{BaseURL: srv.URL})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer eng.Close()

	cl := NewClient(eng, "/wp-cli")
	cl.OnRaw("greet", func(args []any, ackID *int) {
		if ackID != nil {
			ctx := context.Background()
			_ = cl.ackReply(ctx, *ackID, []any{"world"})
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := cl.Connect(ctx); err != nil {
		t.Fatalf("Connect: %v", err)
	}

	select {
	case raw := <-ackRaw:
		var data []any
		// Parse the reply: "3/wp-cli,99["world"]"
		d := newSioDecoder()
		pkt, _, _ := d.add(Packet{Type: eioMessage, Data: []byte(raw)})
		if pkt.Type != sioAck {
			t.Errorf("reply type = %d, want sioAck(%d)", pkt.Type, sioAck)
		}
		if pkt.ID == nil || *pkt.ID != 99 {
			t.Errorf("reply ack id = %v, want 99", pkt.ID)
		}
		data = pkt.Data
		if len(data) == 0 || data[0] != "world" {
			t.Errorf("reply data = %v", data)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout: ack reply never received")
	}
}

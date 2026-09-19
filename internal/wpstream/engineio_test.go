package wpstream

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// fakeEIOServer serves the EIO4 polling handshake then accepts a websocket
// upgrade, completes the 2probe/5 dance, and sends one message packet.
func fakeEIOServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/socket.io/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("transport") == "polling" {
			// Open packet: type '0' + JSON handshake.
			w.Header().Set("Content-Type", "text/plain; charset=UTF-8")
			_, _ = w.Write([]byte(`0{"sid":"abc","upgrades":["websocket"],"pingInterval":300,"pingTimeout":200,"maxPayload":1000000}`))
			return
		}
		// websocket transport
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close(websocket.StatusNormalClosure, "")
		ctx := r.Context()
		// Expect "2probe", reply "3probe".
		_, probe, _ := c.Read(ctx)
		if string(probe) != "2probe" {
			t.Errorf("probe = %q", probe)
		}
		_ = c.Write(ctx, websocket.MessageText, []byte("3probe"))
		// Expect "5" (upgrade).
		_, up, _ := c.Read(ctx)
		if string(up) != "5" {
			t.Errorf("upgrade = %q", up)
		}
		// Send one message packet "4hello".
		_ = c.Write(ctx, websocket.MessageText, []byte("4hello"))
		// Then a server ping "2"; expect pong "3".
		_ = c.Write(ctx, websocket.MessageText, []byte("2"))
		_, pong, _ := c.Read(ctx)
		if string(pong) != "3" {
			t.Errorf("pong = %q", pong)
		}
		time.Sleep(20 * time.Millisecond)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestEngineIOHandshakeAndUpgrade(t *testing.T) {
	srv := fakeEIOServer(t)
	eng, err := Dial(context.Background(), DialOptions{
		BaseURL: srv.URL,
		Header:  http.Header{"Authorization": {"Bearer tok"}},
	})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer eng.Close()

	if eng.SID() != "abc" {
		t.Errorf("sid = %q, want abc", eng.SID())
	}
	pkt, err := eng.Read(context.Background())
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if pkt.Type != '4' || string(pkt.Data) != "hello" {
		t.Errorf("pkt = %c%q", pkt.Type, pkt.Data)
	}
	// The transport must auto-answer the server ping with a pong (asserted
	// server-side). Give the heartbeat goroutine a moment.
	time.Sleep(30 * time.Millisecond)
}

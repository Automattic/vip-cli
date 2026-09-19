package sync

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Khan/genqlient/graphql"
)

// syncStub is a per-operation GraphQL fake. Each operation is keyed by
// the JSON request's operationName; the value is either a static body
// or a function that returns the body for the i-th hit (0-indexed).
type syncStub struct {
	mu          sync.Mutex
	bodies      map[string]func(int) string
	hits        map[string]int
	defaultBody string
}

func newStub() *syncStub {
	return &syncStub{
		bodies:      map[string]func(int) string{},
		hits:        map[string]int{},
		defaultBody: `{"data":null}`,
	}
}

func (s *syncStub) setStatic(op, body string) {
	s.bodies[op] = func(int) string { return body }
}

func (s *syncStub) setSeq(op string, bodies ...string) {
	s.bodies[op] = func(i int) string {
		if i >= len(bodies) {
			return bodies[len(bodies)-1]
		}
		return bodies[i]
	}
}

func (s *syncStub) start(t *testing.T) (*httptest.Server, graphql.Client) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(buf)
		op := extractOp(string(buf))

		s.mu.Lock()
		fn := s.bodies[op]
		i := s.hits[op]
		s.hits[op] = i + 1
		s.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		if fn == nil {
			_, _ = w.Write([]byte(s.defaultBody))
			return
		}
		_, _ = w.Write([]byte(fn(i)))
	}))
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	return srv, c
}

// extractOp finds the operationName value in a JSON GraphQL request
// body without parsing the whole document. Substring-search is enough
// for tests.
func extractOp(body string) string {
	const key = `"operationName":"`
	i := strings.Index(body, key)
	if i < 0 {
		return ""
	}
	rest := body[i+len(key):]
	j := strings.Index(rest, `"`)
	if j < 0 {
		return ""
	}
	return rest[:j]
}

func TestStartHappyPath(t *testing.T) {
	stub := newStub()
	stub.setStatic("SyncEnvironment",
		`{"data":{"syncEnvironment":{"environment":{"id":7}}}}`)
	srv, c := stub.start(t)
	defer srv.Close()

	if err := Start(context.Background(), c, 42, 7); err != nil {
		t.Fatalf("Start: %v", err)
	}
}

func TestStartAlreadySyncing(t *testing.T) {
	stub := newStub()
	stub.setStatic("SyncEnvironment",
		`{"data":null,"errors":[{"message":"Site is already syncing"}]}`)
	srv, c := stub.start(t)
	defer srv.Close()

	err := Start(context.Background(), c, 42, 7)
	if err == nil {
		t.Fatal("expected AlreadySyncingError, got nil")
	}
	var ase AlreadySyncingError
	if !errors.As(err, &ase) {
		t.Fatalf("err = %v (%T), want AlreadySyncingError", err, err)
	}
}

func TestStartOtherErrorPassthrough(t *testing.T) {
	stub := newStub()
	stub.setStatic("SyncEnvironment",
		`{"data":null,"errors":[{"message":"App not found"}]}`)
	srv, c := stub.start(t)
	defer srv.Close()

	err := Start(context.Background(), c, 42, 7)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var ase AlreadySyncingError
	if errors.As(err, &ase) {
		t.Fatalf("expected non-AlreadySyncingError; got %v", err)
	}
	if !strings.Contains(err.Error(), "App not found") {
		t.Fatalf("err = %v, want substring 'App not found'", err)
	}
}

func TestStatusReturnsProgress(t *testing.T) {
	stub := newStub()
	stub.setStatic("SyncProgress", `{"data":{"app":{"id":42,"environments":[
		{"id":7,"syncProgress":{"status":"running","sync":99,"steps":[
			{"name":"Backup","status":"success","step":"backup"},
			{"name":"Restore","status":"running","step":"restore"}
		]}}
	]}}}`)
	srv, c := stub.start(t)
	defer srv.Close()

	p, err := Status(context.Background(), c, 42, 7)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if p == nil {
		t.Fatal("Status returned nil progress")
	}
	if p.Status != "running" || p.Sync != 99 {
		t.Errorf("Progress = %+v, want status=running sync=99", p)
	}
	if len(p.Steps) != 2 {
		t.Fatalf("Steps len = %d, want 2", len(p.Steps))
	}
	if p.Steps[0].Step != "backup" || p.Steps[1].Status != "running" {
		t.Errorf("Steps = %+v, want backup/success + restore/running", p.Steps)
	}
}

func TestPollTerminatesOnSuccess(t *testing.T) {
	stub := newStub()
	// First call: running. Second call: success.
	stub.setSeq("SyncProgress",
		`{"data":{"app":{"id":42,"environments":[
			{"id":7,"syncProgress":{"status":"running","sync":1,"steps":[
				{"name":"Backup","status":"running","step":"backup"}
			]}}
		]}}}`,
		`{"data":{"app":{"id":42,"environments":[
			{"id":7,"syncProgress":{"status":"success","sync":1,"steps":[
				{"name":"Backup","status":"success","step":"backup"}
			]}}
		]}}}`,
	)
	srv, c := stub.start(t)
	defer srv.Close()

	var transitions atomic.Int32
	p, err := Poll(context.Background(), c, 42, 7, PollOpts{
		Interval: 1 * time.Millisecond,
		OnTransition: func(s Step) {
			transitions.Add(1)
		},
	})
	if err != nil {
		t.Fatalf("Poll: %v", err)
	}
	if p == nil || p.Status != StatusSuccess {
		t.Fatalf("Poll final = %+v, want status=success", p)
	}
	if n := transitions.Load(); n < 2 {
		t.Errorf("transitions = %d, want >= 2 (running then success)", n)
	}
}

func TestPollRespectsCancel(t *testing.T) {
	stub := newStub()
	// Always running — Poll will never terminate on its own.
	stub.setStatic("SyncProgress", `{"data":{"app":{"id":42,"environments":[
		{"id":7,"syncProgress":{"status":"running","sync":1,"steps":[]}}
	]}}}`)
	srv, c := stub.start(t)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := Poll(ctx, c, 42, 7, PollOpts{Interval: 5 * time.Millisecond})
	if err == nil {
		t.Fatal("Poll should return ctx error on cancel, got nil")
	}
	if !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want ctx error", err)
	}
}

func TestPollOnErrorTransient(t *testing.T) {
	stub := newStub()
	// First Status call returns an error; second returns success.
	stub.setSeq("SyncProgress",
		`{"data":null,"errors":[{"message":"transient blip"}]}`,
		`{"data":{"app":{"id":42,"environments":[
			{"id":7,"syncProgress":{"status":"success","sync":1,"steps":[]}}
		]}}}`,
	)
	srv, c := stub.start(t)
	defer srv.Close()

	var sawErr atomic.Int32
	p, err := Poll(context.Background(), c, 42, 7, PollOpts{
		Interval: 1 * time.Millisecond,
		OnError: func(e error) bool {
			sawErr.Add(1)
			return true // treat as transient
		},
	})
	if err != nil {
		t.Fatalf("Poll: %v", err)
	}
	if p == nil || p.Status != StatusSuccess {
		t.Fatalf("Poll final = %+v, want status=success", p)
	}
	if sawErr.Load() == 0 {
		t.Errorf("OnError never called; want at least once")
	}
}

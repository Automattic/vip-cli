package commands

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// cachePurgeStub mirrors envvarMutationStub but records every body so the
// IGNORED-positional test can assert what the mutation actually sent.
type cachePurgeStub struct {
	mu       sync.Mutex
	lastBody string
	hits     int
	respBody string
}

func (s *cachePurgeStub) start(_ *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s.mu.Lock()
		s.lastBody = string(body)
		s.hits++
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if s.respBody == "" {
			_, _ = w.Write([]byte(`{"data":null}`))
			return
		}
		_, _ = w.Write([]byte(s.respBody))
	}))
}

func (s *cachePurgeStub) body() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastBody
}

func (s *cachePurgeStub) hitCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.hits
}

func TestCachePurgeURLSinglePositional(t *testing.T) {
	stub := &cachePurgeStub{
		respBody: `{"data":{"purgePageCache":{"success":true,"urls":["https://example-app.go-vip.co/sample-page/"]}}}`,
	}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := CachePurgeURLCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	cmd.SetContext(ctxWithAppEnv(42, 7))

	if err := runCachePurgeURL(cmd, []string{"https://example-app.go-vip.co/sample-page/"}); err != nil {
		t.Fatalf("runCachePurgeURL: %v", err)
	}
	out := stdout.String()
	if !strings.Contains(out, "- Purged URL: https://example-app.go-vip.co/sample-page/") {
		t.Errorf("stdout missing per-URL line; got %q", out)
	}
	body := stub.body()
	if !strings.Contains(body, `"operationName":"PurgePageCache"`) {
		t.Errorf("expected PurgePageCache op; body=%s", body)
	}
	if !strings.Contains(body, `"urls":["https://example-app.go-vip.co/sample-page/"]`) {
		t.Errorf("expected single URL in input; body=%s", body)
	}
}

// TestCachePurgeURLFromFileReplacesPositional confirms --from-file fully
// REPLACES positional URLs (Node parity: the variable `urls` is reassigned
// unconditionally inside the `if (opt.fromFile)` branch). The positional
// IGNORED URL must NOT appear in the wire body.
func TestCachePurgeURLFromFileReplacesPositional(t *testing.T) {
	stub := &cachePurgeStub{
		respBody: `{"data":{"purgePageCache":{"success":true,"urls":["https://a.example.com/","https://b.example.com/"]}}}`,
	}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	dir := t.TempDir()
	urlsPath := filepath.Join(dir, "urls.txt")
	// Mix in blank lines + trailing/leading whitespace to exercise the
	// per-line TrimSpace and empty-line drop.
	if err := os.WriteFile(urlsPath, []byte("https://a.example.com/\n  https://b.example.com/  \n\n"), 0600); err != nil {
		t.Fatalf("write urls.txt: %v", err)
	}

	cmd := CachePurgeURLCmd()
	_ = cmd.Flags().Set("from-file", urlsPath)
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&bytes.Buffer{})
	cmd.SetContext(ctxWithAppEnv(42, 7))

	// Positional URL that must be IGNORED.
	if err := runCachePurgeURL(cmd, []string{"https://example.com/IGNORED"}); err != nil {
		t.Fatalf("runCachePurgeURL: %v", err)
	}

	body := stub.body()
	if strings.Contains(body, "IGNORED") {
		t.Errorf("--from-file must replace positional URLs; IGNORED leaked into body=%s", body)
	}
	if !strings.Contains(body, `"urls":["https://a.example.com/","https://b.example.com/"]`) {
		t.Errorf("expected URLs from file (trimmed, no empties); body=%s", body)
	}
	out := stdout.String()
	if !strings.Contains(out, "- Purged URL: https://a.example.com/") || !strings.Contains(out, "- Purged URL: https://b.example.com/") {
		t.Errorf("stdout missing both purged URLs; got %q", out)
	}
}

// TestCachePurgeURLEmptyExits1 covers the no-positional/no-from-file path.
// The mutation must NOT fire — the empty check runs before the GraphQL call.
func TestCachePurgeURLEmptyExits1(t *testing.T) {
	stub := &cachePurgeStub{respBody: `{"data":null}`}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	cmd := CachePurgeURLCmd()
	var stdout, stderr bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stderr)
	cmd.SetContext(ctxWithAppEnv(42, 7))

	err := runCachePurgeURL(cmd, nil)
	if err == nil {
		t.Fatal("expected error for empty URL list, got nil")
	}
	if !strings.Contains(err.Error(), "Please supply at least one URL.") {
		t.Errorf("error must match Node text; got %q", err.Error())
	}
	if stub.hitCount() != 0 {
		t.Errorf("mutation must not fire on empty URL list; hits=%d body=%s", stub.hitCount(), stub.body())
	}
}

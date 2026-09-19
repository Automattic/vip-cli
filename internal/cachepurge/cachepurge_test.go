package cachepurge

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"
)

// TestPurgeSendsMutationAndReturnsCanonicalURLs verifies (a) the wire
// request carries the PurgePageCache operation + the expected input shape
// and (b) the function returns the server-canonicalized URL slice rather
// than echoing the input.
func TestPurgeSendsMutationAndReturnsCanonicalURLs(t *testing.T) {
	var lastBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		lastBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		// Return DIFFERENT URLs than the input — server canonicalization.
		_, _ = w.Write([]byte(`{"data":{"purgePageCache":{"success":true,"urls":["https://canonical.example.com/a","https://canonical.example.com/b"]}}}`))
	}))
	defer srv.Close()

	c := graphql.NewClient(srv.URL, srv.Client())
	in := []string{"https://example.com/a", "https://example.com/b"}
	out, err := Purge(context.Background(), c, 42, 7, in)
	if err != nil {
		t.Fatalf("Purge: %v", err)
	}

	if len(out) != 2 || out[0] != "https://canonical.example.com/a" || out[1] != "https://canonical.example.com/b" {
		t.Errorf("Purge returned %v, want canonical server URLs", out)
	}

	if !strings.Contains(lastBody, `"operationName":"PurgePageCache"`) {
		t.Errorf("request must use PurgePageCache op; body=%s", lastBody)
	}
	if !strings.Contains(lastBody, `"appId":42`) {
		t.Errorf("input.appId missing; body=%s", lastBody)
	}
	if !strings.Contains(lastBody, `"environmentId":7`) {
		t.Errorf("input.environmentId missing; body=%s", lastBody)
	}
	if !strings.Contains(lastBody, `"urls":["https://example.com/a","https://example.com/b"]`) {
		t.Errorf("input.urls missing or wrong shape; body=%s", lastBody)
	}
}

// TestPurgeNilPayloadReturnsEmpty pins the nil-guard in Purge: a server
// response of {"data":{"purgePageCache":null}} must produce (nil, nil)
// instead of panicking on the .Urls dereference. Prevents the guard from
// being silently dropped by a future "simplification".
func TestPurgeNilPayloadReturnsEmpty(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"purgePageCache":null}}`))
	}))
	defer srv.Close()

	c := graphql.NewClient(srv.URL, srv.Client())
	out, err := Purge(context.Background(), c, 1, 2, []string{"https://example.com/"})
	if err != nil {
		t.Fatalf("unexpected error on null payload: %v", err)
	}
	if out != nil {
		t.Errorf("expected nil slice for null payload; got %v", out)
	}
}

// TestPurgeServerError propagates the underlying GraphQL error so the
// command handler can wrap it with the "Failed to purge URL(s)..." prefix.
func TestPurgeServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"errors":[{"message":"boom"}]}`))
	}))
	defer srv.Close()

	c := graphql.NewClient(srv.URL, srv.Client())
	out, err := Purge(context.Background(), c, 1, 2, []string{"https://example.com/"})
	if err == nil {
		t.Fatalf("expected error from server; got out=%v", out)
	}
	if !strings.Contains(err.Error(), "boom") {
		t.Errorf("error must propagate server message; got %q", err.Error())
	}
}

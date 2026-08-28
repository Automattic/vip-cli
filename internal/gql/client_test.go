package gql

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestClientPostsToGraphQLEndpointWithXQuery(t *testing.T) {
	var got struct {
		path  string
		query string
		body  string
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.path = r.URL.Path
		got.query = r.URL.RawQuery
		b := make([]byte, 4096)
		n, _ := r.Body.Read(b)
		got.body = string(b[:n])
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{"me":null}}`))
	}))
	defer srv.Close()

	c := NewClient(Config{APIHost: srv.URL})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"query":"query Me{me{id}}","operationName":"Me"}`))
	req.Header.Set("Content-Type", "application/json")
	if _, err := c.Do(req); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if got.path != "/graphql" {
		t.Errorf("path = %q, want /graphql", got.path)
	}
	if !strings.HasPrefix(got.query, "x_query=Me") {
		t.Errorf("query = %q, want prefix x_query=Me", got.query)
	}
}

func TestClientSkipsXQueryInTestEnv(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RawQuery != "" {
			t.Errorf("test-mode client must not append x_query; got %q", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{}}`))
	}))
	defer srv.Close()

	c := NewClient(Config{APIHost: srv.URL, TestMode: true})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"query":"{me{id}}","operationName":"Me"}`))
	if _, err := c.Do(req); err != nil {
		t.Fatalf("Do: %v", err)
	}
}

func TestClientSetsAuthHeaderWhenTokenPresent(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("Authorization")
		w.Write([]byte(`{"data":{}}`))
	}))
	defer srv.Close()
	c := NewClient(Config{APIHost: srv.URL, TestMode: true, Token: "abc.def.ghi"})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"{me{id}}"}`))
	c.Do(req)
	if got != "Bearer abc.def.ghi" {
		t.Errorf("Authorization = %q, want Bearer abc.def.ghi", got)
	}
}

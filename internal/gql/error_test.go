package gql

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestErrorMiddleware401InactivityMessage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		w.Write([]byte(`{"code":"token-disabled-inactivity","message":"x"}`))
	}))
	defer srv.Close()
	var stderr bytes.Buffer
	var calledCode int
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewErrorMiddleware(ErrorConfig{
			Stderr: &stderr, Exit: func(code int) { calledCode = code },
		})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"query Me{me{id}}"}`))
	c.Do(req)
	if calledCode != 1 {
		t.Errorf("exit code = %d, want 1", calledCode)
	}
	if !strings.Contains(stderr.String(), "Your token has expired due to inactivity") {
		t.Errorf("stderr missing inactivity message: %q", stderr.String())
	}
	if !strings.Contains(stderr.String(), "please log out with `vip logout`") {
		t.Errorf("stderr missing logout suffix: %q", stderr.String())
	}
}

func TestErrorMiddleware401DefaultMessage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		w.Write([]byte(`not-json`))
	}))
	defer srv.Close()
	var stderr bytes.Buffer
	var calledCode int
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewErrorMiddleware(ErrorConfig{
			Stderr: &stderr, Exit: func(code int) { calledCode = code },
		})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"query Me{me{id}}"}`))
	c.Do(req)
	if calledCode != 1 {
		t.Errorf("exit code = %d, want 1", calledCode)
	}
	if !strings.Contains(stderr.String(), "You are not authorized to perform this request") {
		t.Errorf("stderr missing default message: %q", stderr.String())
	}
}

func TestErrorMiddleware401Silenced(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		w.Write([]byte(`{"code":"x"}`))
	}))
	defer srv.Close()
	called := false
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewErrorMiddleware(ErrorConfig{
			Silence: true, Exit: func(int) { called = true },
		})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"query Me{me{id}}"}`))
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if called {
		t.Error("exiter must not be called when Silence is true")
	}
	if resp.StatusCode != 401 {
		t.Errorf("response status = %d, want 401", resp.StatusCode)
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
}

func TestErrorMiddlewareGraphQLErrorsExit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte(`{"data":null,"errors":[{"message":"App not found"}]}`))
	}))
	defer srv.Close()
	var stderr bytes.Buffer
	var calledCode int
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewErrorMiddleware(ErrorConfig{
			ExitOnError: true, Stderr: &stderr, Exit: func(code int) { calledCode = code },
		})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"query Me{me{id}}"}`))
	c.Do(req)
	if calledCode != 1 {
		t.Errorf("exit code = %d, want 1", calledCode)
	}
	if !strings.Contains(stderr.String(), "Error:") || !strings.Contains(stderr.String(), "App not found") {
		t.Errorf("stderr missing GraphQL error: %q", stderr.String())
	}
}

func TestErrorMiddlewareGraphQLErrorsNoExit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte(`{"errors":[{"message":"oops"}]}`))
	}))
	defer srv.Close()
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewErrorMiddleware(ErrorConfig{
			ExitOnError: false, Exit: func(int) { t.Error("must not exit when ExitOnError is false") },
		})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"query Me{me{id}}"}`))
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), `"errors"`) {
		t.Errorf("response body should still contain errors when not exiting: %s", body)
	}
}

// TestErrorMiddlewareWithAllowGQLErrorsSuppressesPrintAndExit pins the
// opt-out contract for WithAllowGQLErrors: a request whose context has the
// flag set must NOT print "Error:" to stderr AND must NOT call Exit on a
// GraphQL errors[] response. The response body remains readable so the
// caller (e.g. sync.Start) can inspect the errors[] inline.
func TestErrorMiddlewareWithAllowGQLErrorsSuppressesPrintAndExit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"errors":[{"message":"Site is already syncing"}]}`))
	}))
	defer srv.Close()
	var stderr bytes.Buffer
	exitCalled := false
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewErrorMiddleware(ErrorConfig{
			Stderr: &stderr, ExitOnError: true, Exit: func(int) { exitCalled = true },
		})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Sync","query":"mutation{x}"}`))
	req = req.WithContext(WithAllowGQLErrors(req.Context()))
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if exitCalled {
		t.Error("Exit must NOT be called when WithAllowGQLErrors is on context")
	}
	if stderr.Len() != 0 {
		t.Errorf("stderr must be empty when opted out; got %q", stderr.String())
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "Site is already syncing") {
		t.Errorf("body must still be readable downstream; got %q", body)
	}
}

// TestErrorMiddlewareWithAllowGQLErrorsDoesNotAffect401 verifies the
// documented promise that the opt-out covers only GraphQL errors[],
// NOT the 401 path. A 401 response with WithAllowGQLErrors set must still
// print "Unauthorized:" and call Exit(1). Regression guard so a future
// refactor of error.go can't silently widen the opt-out's scope.
func TestErrorMiddlewareWithAllowGQLErrorsDoesNotAffect401(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		w.Write([]byte(`{"code":"token-disabled-inactivity"}`))
	}))
	defer srv.Close()
	var stderr bytes.Buffer
	var calledCode int
	c := NewClient(Config{
		APIHost: srv.URL, TestMode: true,
		Middleware: []Middleware{NewErrorMiddleware(ErrorConfig{
			Stderr: &stderr, Exit: func(code int) { calledCode = code },
		})},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/graphql", strings.NewReader(`{"operationName":"Me","query":"query Me{me{id}}"}`))
	req = req.WithContext(WithAllowGQLErrors(req.Context()))
	c.Do(req)
	if calledCode != 1 {
		t.Errorf("401 must still exit(1) even with WithAllowGQLErrors; got %d", calledCode)
	}
	if !strings.Contains(stderr.String(), "Unauthorized:") {
		t.Errorf("401 must still print 'Unauthorized:'; got %q", stderr.String())
	}
}

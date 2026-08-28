package envvar

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/Khan/genqlient/graphql"
)

// envvarServer returns a stub /graphql endpoint that responds with the given
// JSON body for every request. Sufficient for these tests because we drive
// each genqlient call in isolation.
func envvarServer(body string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
}

func TestEnvvarListReturnsNames(t *testing.T) {
	srv := envvarServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":2,"nodes":[{"name":"FOO"},{"name":"BAR"}]}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	names, err := List(context.Background(), c, 1, 2)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(names) != 2 || names[0] != "FOO" || names[1] != "BAR" {
		t.Errorf("names = %v, want [FOO BAR]", names)
	}
}

func TestEnvvarListEmpty(t *testing.T) {
	srv := envvarServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":0,"nodes":[]}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	names, err := List(context.Background(), c, 1, 2)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(names) != 0 {
		t.Errorf("names = %v, want empty", names)
	}
}

func TestEnvvarGetFound(t *testing.T) {
	srv := envvarServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":2,"nodes":[{"name":"FOO","value":"1"},{"name":"BAR","value":"two"}]}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	ev, err := Get(context.Background(), c, 1, 2, "BAR")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if ev == nil || ev.Name != "BAR" || ev.Value != "two" {
		t.Errorf("Get(BAR) = %+v, want {Name:BAR Value:two}", ev)
	}
}

func TestEnvvarGetNotFound(t *testing.T) {
	srv := envvarServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":1,"nodes":[{"name":"FOO","value":"1"}]}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	ev, err := Get(context.Background(), c, 1, 2, "MISSING")
	if err != nil {
		t.Fatalf("Get(MISSING) error: %v", err)
	}
	if ev != nil {
		t.Errorf("Get(MISSING) = %+v, want nil", ev)
	}
}

func TestEnvvarGetAllReturnsValues(t *testing.T) {
	srv := envvarServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":2,"nodes":[{"name":"A","value":"1"},{"name":"B","value":"two"}]}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	vars, err := GetAll(context.Background(), c, 1, 2)
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if len(vars) != 2 {
		t.Fatalf("vars len = %d, want 2; got=%+v", len(vars), vars)
	}
	if vars[0].Name != "A" || vars[0].Value != "1" {
		t.Errorf("vars[0] = %+v, want {A 1}", vars[0])
	}
	if vars[1].Name != "B" || vars[1].Value != "two" {
		t.Errorf("vars[1] = %+v, want {B two}", vars[1])
	}
}

func TestEnvvarGetAllNullValueIsEmptyString(t *testing.T) {
	// Schema declares value as nullable: `value: String`. A null value should
	// surface as an empty Go string rather than panic on a nil pointer.
	srv := envvarServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"environmentVariables":{"total":1,"nodes":[{"name":"NULLY","value":null}]}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	vars, err := GetAll(context.Background(), c, 1, 2)
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	if len(vars) != 1 || vars[0].Name != "NULLY" || vars[0].Value != "" {
		t.Errorf("vars = %+v, want one {NULLY ''}", vars)
	}
}

// recordingServer is a multi-route stub that records the last request body.
// Used by Set / Delete tests to assert the wire-level mutation shape.
type recordingServer struct {
	mu       sync.Mutex
	lastBody string
	respBody string
}

func (s *recordingServer) start() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s.mu.Lock()
		s.lastBody = string(body)
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(s.respBody))
	}))
}

func (s *recordingServer) body() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastBody
}

func TestValidateName(t *testing.T) {
	cases := []struct {
		name    string
		wantErr bool
	}{
		{"FOO", false},
		{"FOO_BAR", false},
		{"FOO123", false},
		{"F", false},
		{"A1_B2", false},
		// Empty: distinct error message.
		{"", true},
		// Lowercase rejected.
		{"foo", true},
		{"Foo", true},
		// Underscore-start rejected (Node parity).
		{"_FOO", true},
		// Digit-start rejected.
		{"1FOO", true},
		// Dash rejected.
		{"FOO-BAR", true},
		// Space rejected.
		{"FOO BAR", true},
		// Dot rejected.
		{"FOO.BAR", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateName(tc.name)
			if tc.wantErr && err == nil {
				t.Errorf("ValidateName(%q) = nil, want error", tc.name)
			}
			if !tc.wantErr && err != nil {
				t.Errorf("ValidateName(%q) = %v, want nil", tc.name, err)
			}
		})
	}
}

func TestValidateNameInvalidErrorMessage(t *testing.T) {
	err := ValidateName("bad-name")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, ErrInvalidName) {
		t.Errorf("invalid-name path must return ErrInvalidName sentinel; got %v", err)
	}
	if !strings.Contains(err.Error(), "A-Z, 0-9, or _") {
		t.Errorf("error message must include Node-parity hint; got %q", err.Error())
	}
}

func TestSetSendsAddMutation(t *testing.T) {
	rs := &recordingServer{
		respBody: `{"data":{"addEnvironmentVariable":{"environmentVariables":{"total":1,"nodes":[{"name":"FOO"}]}}}}`,
	}
	srv := rs.start()
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	if err := Set(context.Background(), c, 42, 7, "FOO", "hello", false); err != nil {
		t.Fatalf("Set: %v", err)
	}
	body := rs.body()
	if !strings.Contains(body, `"operationName":"AddEnvironmentVariable"`) {
		t.Errorf("expected AddEnvironmentVariable operation; body=%s", body)
	}
	if !strings.Contains(body, `"name":"FOO"`) {
		t.Errorf("expected name=FOO in input; body=%s", body)
	}
	if !strings.Contains(body, `"value":"hello"`) {
		t.Errorf("expected value=hello in input; body=%s", body)
	}
	if !strings.Contains(body, `"applicationId":42`) {
		t.Errorf("expected applicationId=42; body=%s", body)
	}
	if !strings.Contains(body, `"environmentId":7`) {
		t.Errorf("expected environmentId=7; body=%s", body)
	}
}

func TestDeleteSendsDeleteMutationWithEmptyValue(t *testing.T) {
	rs := &recordingServer{
		respBody: `{"data":{"deleteEnvironmentVariable":{"environmentVariables":{"total":0,"nodes":[]}}}}`,
	}
	srv := rs.start()
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	if err := Delete(context.Background(), c, 42, 7, "FOO", false); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	body := rs.body()
	if !strings.Contains(body, `"operationName":"DeleteEnvironmentVariable"`) {
		t.Errorf("expected DeleteEnvironmentVariable operation; body=%s", body)
	}
	// Node parity: delete sends value: "" — empty string, NOT omitted.
	if !strings.Contains(body, `"value":""`) {
		t.Errorf("delete must send empty-string value; body=%s", body)
	}
	if !strings.Contains(body, `"name":"FOO"`) {
		t.Errorf("expected name=FOO in input; body=%s", body)
	}
}

func TestReadFromFileTrimsSurroundingWhitespace(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "value.txt")
	// Surrounding whitespace + a newline that Node's data.trim() would strip,
	// and an internal newline that must survive.
	content := "\n  hello\nworld\n  \n"
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatalf("write tmp file: %v", err)
	}
	got, err := ReadFromFile(path)
	if err != nil {
		t.Fatalf("ReadFromFile: %v", err)
	}
	want := "hello\nworld"
	if got != want {
		t.Errorf("ReadFromFile = %q, want %q", got, want)
	}
}

func TestReadFromFileMissing(t *testing.T) {
	_, err := ReadFromFile(filepath.Join(t.TempDir(), "does-not-exist"))
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

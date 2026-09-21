package gql

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

type debugTransportFunc func(*http.Request) (*http.Response, error)

func (f debugTransportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestHTTPDiagnosticsPreserveRequestAndOmitSecrets(t *testing.T) {
	var out bytes.Buffer
	ctx := debuglog.WithLogger(context.Background(), "@automattic/vip:http", &out)
	body := `{"operationName":"EdgeWorkers","query":"query EdgeWorkers { me { id } }","variables":{"secret":"body-secret"}}`
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://user:password-secret@example.test/graphql?token=query-secret", strings.NewReader(body))
	c := NewClient(Config{Token: "header-secret", HTTPClient: &http.Client{Transport: debugTransportFunc(func(r *http.Request) (*http.Response, error) {
		got, _ := io.ReadAll(r.Body)
		if string(got) != body || r.URL.Query().Get("token") != "query-secret" || r.Header.Get("Authorization") != "Bearer header-secret" {
			t.Fatal("diagnostics changed request")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"data":{}}`)), Header: make(http.Header)}, nil
	})}})
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if !strings.Contains(out.String(), "running fetch https://example.test/graphql") {
		t.Fatalf("missing fetch diagnostic: %q", out.String())
	}
	for _, secret := range []string{"password-secret", "body-secret", "query-secret", "header-secret"} {
		if strings.Contains(out.String(), secret) {
			t.Fatalf("diagnostic exposed %s", secret)
		}
	}
}

func TestGraphQLDebugWithHandledErrorsAndRetries(t *testing.T) {
	var out, ordinaryErrors bytes.Buffer
	ctx := WithAllowGQLErrors(debuglog.WithLogger(context.Background(), "@automattic/vip:http:graphql", &out))
	responseBody := `{"errors":[{"message":"message-secret","path":["app"],"extensions":{"code":"FORBIDDEN","token":"extension-secret"}}]}`
	calls := 0
	c := NewClient(Config{HTTPClient: &http.Client{Transport: debugTransportFunc(func(r *http.Request) (*http.Response, error) {
		_, _ = io.Copy(io.Discard, r.Body)
		calls++
		status := 200
		if calls == 1 {
			status = 503
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(responseBody)), Header: make(http.Header)}, nil
	})}, Middleware: []Middleware{NewErrorMiddleware(ErrorConfig{Stderr: &ordinaryErrors, ExitOnError: true, Exit: func(int) { t.Fatal("handled error exited") }}), NewRetryMiddleware(RetryConfig{MaxAttempts: 2, NoDelay: true})}})
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://example.test/graphql", strings.NewReader(`{"operationName":"EdgeWorkers","query":"query EdgeWorkers { me { id } }"}`))
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != responseBody || calls != 2 || ordinaryErrors.Len() != 0 {
		t.Fatal("diagnostics changed retry/error handling")
	}
	for _, want := range []string{"Retrying", "EdgeWorkers", "Attempt: 1", "GraphQL errors", "FORBIDDEN"} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("missing %q in %q", want, out.String())
		}
	}
	for _, secret := range []string{"message-secret", "extension-secret"} {
		if strings.Contains(out.String(), secret) {
			t.Fatalf("diagnostic exposed %s", secret)
		}
	}
}

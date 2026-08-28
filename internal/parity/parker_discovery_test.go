//go:build parity

package parity

import (
	"context"
	json "encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type parkerDiscoveryRequest struct {
	OperationName string         `json:"operationName"`
	Query         string         `json:"query"`
	Variables     map[string]any `json:"variables"`
}

func decodeParkerDiscoveryRequest(t *testing.T, r *http.Request) parkerDiscoveryRequest {
	t.Helper()
	if r.URL.Path != "/graphql" {
		t.Fatalf("request path = %q, want /graphql", r.URL.Path)
	}
	if r.Header.Get("Authorization") != "Bearer "+parkerTestToken {
		t.Fatalf("authorization header missing")
	}
	var req parkerDiscoveryRequest
	if err := json.UnmarshalRead(r.Body, &req); err != nil {
		t.Fatal(err)
	}
	return req
}

func TestDiscoverParkerContextUsesBoundedCatalogSortsAndProbes(t *testing.T) {
	var catalogCalls, probeCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		req := decodeParkerDiscoveryRequest(t, r)
		w.Header().Set("Content-Type", "application/json")
		switch req.OperationName {
		case "LocalParkerParityContexts":
			catalogCalls++
			if catalogCalls > 1 {
				t.Fatal("discovery requested more than one bounded catalog page")
			}
			if _, hasAfter := req.Variables["after"]; hasAfter {
				t.Fatalf("bounded catalog variables unexpectedly include after: %v", req.Variables)
			}
			_, _ = io.WriteString(w, `{"data":{"apps":{"total":3,"nextCursor":"parker-always-sets-this","edges":[{"id":20,"name":"Later","typeId":2,"environments":[{"id":21,"appId":20,"name":"develop","type":"develop"}]},{"id":10,"name":"Chosen-App","typeId":2,"environments":[{"id":11,"appId":10,"name":"demo","type":"develop"}]}]}}}`)
		case "LocalParkerParityCandidate":
			probeCalls++
			if strings.Contains(req.Query, "environmentVariables") {
				t.Fatal("candidate discovery must not read environment-variable metadata")
			}
			if fmt.Sprint(req.Variables["appId"]) == "10" {
				_, _ = io.WriteString(w, `{"data":{"app":null},"errors":[{"message":"unsupported candidate"}]}`)
				return
			}
			_, _ = io.WriteString(w, `{"data":{"app":{"environments":[{"id":21,"environmentVariables":{"total":1,"nodes":[{"name":"SAFE_NAME"}]},"softwareSettings":{"wordpress":{"current":{"version":"7.0"}},"php":null,"muplugins":null,"nodejs":null}}]}}}`)
		default:
			t.Fatalf("unexpected operation %q", req.OperationName)
		}
	}))
	defer srv.Close()

	ctx, err := discoverParkerContext(context.Background(), srv.Client(), srv.URL, parkerTestToken)
	if err != nil {
		t.Fatal(err)
	}
	want := ParkerContext{AppID: 20, AppName: "Later", EnvID: 21, EnvIdentifier: "develop"}
	if ctx != want {
		t.Fatalf("context = %+v, want %+v", ctx, want)
	}
	if catalogCalls != 1 || probeCalls != 2 {
		t.Fatalf("calls catalog=%d probe=%d", catalogCalls, probeCalls)
	}
}

func TestDiscoverParkerContextRejectsMoreEdgesThanTotal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		req := decodeParkerDiscoveryRequest(t, r)
		if req.OperationName != "LocalParkerParityContexts" {
			t.Fatalf("unexpected operation %q", req.OperationName)
		}
		_, _ = io.WriteString(w, `{"data":{"apps":{"total":1,"nextCursor":"ignored","edges":[{"id":1,"name":"one","typeId":2,"environments":[]},{"id":2,"name":"two","typeId":2,"environments":[]}]}}}`)
	}))
	defer srv.Close()

	_, err := discoverParkerContext(context.Background(), srv.Client(), srv.URL, parkerTestToken)
	if err == nil || !strings.Contains(err.Error(), "edge_total_mismatch") {
		t.Fatalf("error = %v, want edge_total_mismatch", err)
	}
}

func TestDiscoverParkerContextReturnsNoSuitableContext(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		req := decodeParkerDiscoveryRequest(t, r)
		switch req.OperationName {
		case "LocalParkerParityContexts":
			_, _ = io.WriteString(w, `{"data":{"apps":{"total":1000,"nextCursor":"ignored","edges":[{"id":0,"name":"malformed","typeId":2,"environments":[{"id":1,"appId":0,"name":"production","type":"production"}]},{"id":2,"name":"valid","typeId":2,"environments":[{"id":2,"appId":2,"name":"production","type":"production"}]}]}}}`)
		case "LocalParkerParityCandidate":
			_, _ = io.WriteString(w, `{"data":{"app":{"environments":[{"id":2,"environmentVariables":{"total":1,"nodes":[{"name":""}]},"softwareSettings":{"wordpress":null,"php":null,"muplugins":null,"nodejs":null}}]}}}`)
		default:
			t.Fatalf("unexpected operation %q", req.OperationName)
		}
	}))
	defer srv.Close()

	_, err := discoverParkerContext(context.Background(), srv.Client(), srv.URL, parkerTestToken)
	if err == nil || !strings.Contains(err.Error(), "no_suitable_context") {
		t.Fatalf("error = %v, want no_suitable_context", err)
	}
}

func TestDiscoverParkerContextAllowsEmptyEnvvarCatalog(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		req := decodeParkerDiscoveryRequest(t, r)
		switch req.OperationName {
		case "LocalParkerParityContexts":
			_, _ = io.WriteString(w, `{"data":{"apps":{"total":10,"edges":[{"id":1,"name":"alias-safe","typeId":2,"environments":[{"id":1,"appId":1,"name":"production","type":"production"}]}]}}}`)
		case "LocalParkerParityCandidate":
			_, _ = io.WriteString(w, `{"data":{"app":{"environments":[{"id":1,"environmentVariables":{"total":0,"nodes":[]},"softwareSettings":{"wordpress":{"current":{"version":"7.0"}},"php":null,"muplugins":null,"nodejs":null}}]}}}`)
		default:
			t.Fatalf("unexpected operation %q", req.OperationName)
		}
	}))
	defer srv.Close()

	ctx, err := discoverParkerContext(context.Background(), srv.Client(), srv.URL, parkerTestToken)
	if err != nil {
		t.Fatal(err)
	}
	want := ParkerContext{AppID: 1, AppName: "alias-safe", EnvID: 1, EnvIdentifier: "production"}
	if ctx != want {
		t.Fatalf("context=%+v, want %+v", ctx, want)
	}
}

func TestDiscoverParkerContextTreatsCandidateProtocolFailureAsFatal(t *testing.T) {
	var probeCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		req := decodeParkerDiscoveryRequest(t, r)
		if req.OperationName == "LocalParkerParityContexts" {
			_, _ = io.WriteString(w, `{"data":{"apps":{"total":1000,"nextCursor":"ignored","edges":[{"id":1,"name":"one","typeId":2,"environments":[{"id":1,"appId":1,"name":"production","type":"production"}]},{"id":2,"name":"two","typeId":2,"environments":[{"id":2,"appId":2,"name":"production","type":"production"}]}]}}}`)
			return
		}
		probeCalls++
		http.Error(w, "protocol failure "+parkerTestToken, http.StatusInternalServerError)
	}))
	defer srv.Close()

	_, err := discoverParkerContext(context.Background(), srv.Client(), srv.URL, parkerTestToken)
	if err == nil || !strings.Contains(err.Error(), "HTTP status 500") {
		t.Fatalf("error = %v, want sanitized HTTP failure", err)
	}
	if strings.Contains(err.Error(), parkerTestToken) {
		t.Fatalf("error leaked token: %v", err)
	}
	if probeCalls != 1 {
		t.Fatalf("probe calls = %d, want fatal stop after 1", probeCalls)
	}
}

func TestParkerEnvironmentIdentifier(t *testing.T) {
	tests := []struct {
		name string
		in   parkerCandidate
		want string
	}{
		{name: "primary", in: parkerCandidate{EnvID: 1, EnvAppID: 1, EnvName: "production", EnvType: "production"}, want: "production"},
		{name: "named child", in: parkerCandidate{EnvID: 2, EnvAppID: 1, EnvName: "demo", EnvType: "develop"}, want: "develop.demo"},
		{name: "native one-label child", in: parkerCandidate{EnvID: 2, EnvAppID: 1, EnvName: "develop", EnvType: "develop"}, want: "develop"},
		{name: "missing type", in: parkerCandidate{EnvID: 2, EnvAppID: 1, EnvName: "demo"}, want: ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := parkerEnvironmentIdentifier(tc.in); got != tc.want {
				t.Fatalf("identifier = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestCandidateContextRejectsAliasThatDoesNotRoundTrip(t *testing.T) {
	_, ok := candidateContext(parkerCandidate{
		AppID: 1, AppName: "contains space", EnvID: 1, EnvAppID: 1,
		EnvName: "production", EnvType: "production",
	})
	if ok {
		t.Fatal("candidate with a non-alias app name unexpectedly accepted")
	}
}

// A GraphQL errors[] payload carries the only useful diagnosis — when GOOP is
// down, Parker answers 200 with `(VIP: fetch failed)` and path ["apps"].
// Discarding it turns "the backing service is down" into an opaque
// contexts_graphql_error and sends the reader hunting through container logs.
// Verified against a real local Parker: this exact payload cost six diagnostic
// steps that the message alone would have answered.
func TestListParkerCandidatesSurfacesGraphQLErrorText(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = decodeParkerDiscoveryRequest(t, r)
		_, _ = io.WriteString(w, `{"errors":[{"message":"An unexpected error occurred while communicating with an internal service. (VIP: fetch failed)","path":["apps"]}],"data":{"apps":null}}`)
	}))
	defer srv.Close()

	_, err := discoverParkerContext(context.Background(), srv.Client(), srv.URL, parkerTestToken)
	if err == nil {
		t.Fatal("err = nil, want a GraphQL error")
	}
	for _, want := range []string{"VIP: fetch failed", "apps"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error text missing %q — the server's diagnosis was discarded\n  got: %v", want, err)
		}
	}
}

// Surfacing server text must not become a token leak: Parker echoes request
// context into some error payloads, and the harness redacts JWTs everywhere
// else (RedactSecrets). A bearer token reaching the failure message would put
// it in CI logs.
func TestListParkerCandidatesRedactsTokensInGraphQLErrorText(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = decodeParkerDiscoveryRequest(t, r)
		_, _ = io.WriteString(w, fmt.Sprintf(
			`{"errors":[{"message":"denied for token %s","path":["apps"]}],"data":{"apps":null}}`,
			parkerTestToken))
	}))
	defer srv.Close()

	_, err := discoverParkerContext(context.Background(), srv.Client(), srv.URL, parkerTestToken)
	if err == nil {
		t.Fatal("err = nil, want a GraphQL error")
	}
	if strings.Contains(err.Error(), parkerTestToken) {
		t.Errorf("error text leaked the bearer token: %v", err)
	}
	// RedactSecrets replaces a known secret verbatim ("<redacted>") before the
	// JWT regex ever runs ("<redacted-jwt>"), so accept either marker — the
	// load-bearing assertion is the token-absence check above.
	if !strings.Contains(err.Error(), "<redacted") {
		t.Errorf("error text should carry a redaction marker; got: %v", err)
	}
}

// The payload shape a REAL local Parker returns when GOOP is down: the
// top-level `path` is absent and the resolver name lives under
// extensions.exception.path. Captured verbatim from a live run — reading only
// the top-level field silently drops the one word ("apps") that says which
// resolver failed.
func TestListParkerCandidatesReadsNestedExceptionPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = decodeParkerDiscoveryRequest(t, r)
		_, _ = io.WriteString(w, `{"errors":[{"message":"An unexpected error occurred while communicating with an internal service. (VIP: fetch failed)","extensions":{"code":"INTERNAL_SERVER_ERROR","exception":{"message":"fetch failed","path":["apps"]}}}],"data":{"apps":null}}`)
	}))
	defer srv.Close()

	_, err := discoverParkerContext(context.Background(), srv.Client(), srv.URL, parkerTestToken)
	if err == nil {
		t.Fatal("err = nil, want a GraphQL error")
	}
	if !strings.Contains(err.Error(), "path: apps") {
		t.Errorf("nested extensions.exception.path was dropped\n  got: %v", err)
	}
}

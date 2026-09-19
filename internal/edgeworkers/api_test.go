package edgeworkers

import (
	"bytes"
	"context"
	json "encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/rechallenge"
	"github.com/Khan/genqlient/graphql"
)

type edgeMemoryKeychain struct{ value string }

func (m *edgeMemoryKeychain) Set(_, _, value string) error { m.value = value; return nil }
func (m *edgeMemoryKeychain) Get(string, string) (string, error) {
	if m.value == "" {
		return "", keychain.ErrNotFound
	}
	return m.value, nil
}
func (m *edgeMemoryKeychain) Delete(string, string) error { m.value = ""; return nil }

func TestAPICreateRechallengeReplaysOnceAndCachesByOperation(t *testing.T) {
	for _, key := range []string{"VIP_PROXY", "vip_proxy", "SOCKS_PROXY", "socks_proxy", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy", "VIP_USE_SYSTEM_PROXY"} {
		t.Setenv(key, "")
	}
	var srv *httptest.Server
	calls := 0
	sessionCalls := 0
	opened := 0
	var bodies [][]byte
	var headers []string
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expires := time.Now().Add(time.Hour).Format(time.RFC3339)
		switch r.URL.Path {
		case "/sessions":
			sessionCalls++
			fmt.Fprintf(w, `{"challengeId":"c1","status":"pending","verificationUrl":"%s/verify","pollIntervalSeconds":1,"expiresAt":"%s"}`, srv.URL, expires)
		case "/sessions/c1":
			fmt.Fprintf(w, `{"challengeId":"c1","status":"verified","expiresAt":"%s","pollIntervalSeconds":1,"provider":"passkeys"}`, expires)
		case "/sessions/c1/exchange":
			fmt.Fprintf(w, `{"elevatedToken":{"token":"fixture-elevated","expiresAt":"%s","purpose":"createEdgeWorker"}}`, expires)
		case "/graphql":
			calls++
			body, _ := io.ReadAll(r.Body)
			bodies = append(bodies, body)
			headers = append(headers, r.Header.Get("x-elevated-token"))
			if calls == 1 {
				fmt.Fprintf(w, `{"errors":[{"message":"elevation required","extensions":{"code":"elevated-permission-required","rechallenge":{"version":"v2","createSessionPath":"%s/sessions","statusPathTemplate":"%s/sessions/{challengeId}","exchangePathTemplate":"%s/sessions/{challengeId}/exchange","elevatedHeaderName":"x-elevated-token"}}}]}`, srv.URL, srv.URL, srv.URL)
				return
			}
			fmt.Fprint(w, `{"data":{"createEdgeWorker":`+workerJSON+`}}`)
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
			http.Error(w, "unexpected", 400)
		}
	}))
	defer srv.Close()
	cache := &rechallenge.TokenCache{Keychain: &keychain.Keychain{Backend: &edgeMemoryKeychain{}, Service: "test-only"}}
	runner := &rechallenge.Runner{Client: &rechallenge.Client{APIHost: srv.URL, HTTP: srv.Client()}, TokenCache: cache, Stdout: io.Discard, OpenURL: func(string) { opened++ }, Sleep: func(context.Context, time.Duration) error { return nil }}
	client := gql.HTTPClientWithMiddleware(srv.URL, "fixture-token", []gql.Middleware{gql.NewErrorMiddleware(gql.ErrorConfig{ExitOnError: true, Exit: func(int) { t.Error("global exit on handled error") }, Stderr: io.Discard}), gql.NewRechallengeMiddleware(gql.RechallengeConfig{TokenCache: cache, Runner: runner, Interactive: func() bool { return true }, Stderr: io.Discard}), gql.NewRetryMiddleware(gql.RetryConfig{MaxAttempts: 3, NoDelay: true})})
	api := APIClient{Client: graphql.NewClient(srv.URL+"/graphql", client)}
	for i := 0; i < 2; i++ {
		if _, err := api.Create(context.Background(), 7, WriteInput{Name: "headers", WASMBinary: "AGFzbQ=="}); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 3 || sessionCalls != 1 || opened != 1 || !bytes.Equal(bodies[0], bodies[1]) || !reflect.DeepEqual(headers, []string{"", "fixture-elevated", "fixture-elevated"}) {
		t.Fatalf("calls=%d sessions=%d opened=%d headers=%v", calls, sessionCalls, opened, headers)
	}
	if token, _ := cache.Get("updateEdgeWorker"); token != nil {
		t.Fatal("elevated token leaked to another operation")
	}
}

const workerJSON = `{"id":9,"name":"headers","location":null,"phases":["client_response"],"onFailure":"continue","active":false,"createdAt":"2026-08-28T00:00:00.000Z","updatedAt":"2026-08-28T00:00:00.000Z","source":""}`

type apiRequest struct {
	Operation string         `json:"operationName"`
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables"`
}

func testAPI(t *testing.T, body string) (APIClient, *[]apiRequest) {
	t.Helper()
	requests := []apiRequest{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req apiRequest
		if err := json.UnmarshalRead(r.Body, &req); err != nil {
			t.Error(err)
		}
		requests = append(requests, req)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, body)
	}))
	t.Cleanup(srv.Close)
	return APIClient{Client: graphql.NewClient(srv.URL, srv.Client())}, &requests
}

func TestAPIReadsPreserveFieldsAndLimitSource(t *testing.T) {
	for _, mode := range []string{"list", "get", "source"} {
		t.Run(mode, func(t *testing.T) {
			api, requests := testAPI(t, `{"data":{"app":{"environments":[{"id":7,"edgeWorkers":[`+workerJSON+`]}]}}}`)
			var worker Worker
			if mode == "list" {
				workers, err := api.List(context.Background(), 42, 7)
				if err != nil {
					t.Fatal(err)
				}
				worker = workers[0]
			} else {
				w, err := api.Get(context.Background(), 42, 7, "headers", mode == "source")
				if err != nil || w == nil {
					t.Fatalf("%v %v", w, err)
				}
				worker = *w
			}
			if worker.ID != 9 || worker.Active || worker.CreatedAt != "2026-08-28T00:00:00.000Z" || !reflect.DeepEqual(worker.Phases, []string{"client_response"}) {
				t.Fatalf("worker: %#v", worker)
			}
			if mode == "source" && (worker.Source == nil || *worker.Source != "") {
				t.Fatalf("empty source lost: %#v", worker)
			}
			if len(*requests) != 1 {
				t.Fatalf("requests: %v", *requests)
			}
			req := (*requests)[0]
			if !strings.Contains(req.Query, "environments(id: $envId)") || req.Variables["appId"] != float64(42) || req.Variables["envId"] != float64(7) {
				t.Fatalf("request: %#v", req)
			}
			if strings.Contains(req.Query, "wasmBinary") || strings.Contains(req.Query, "source") != (mode == "source") {
				t.Fatalf("excessive fields: %s", req.Query)
			}
		})
	}
}

func TestAPIReadEnvelopes(t *testing.T) {
	for _, body := range []string{`{"data":null}`, `{"data":{"app":null}}`, `{"data":{"app":{"environments":[]}}}`, `{"data":{"app":{"environments":[null]}}}`, `{"data":{"app":{"environments":[{"edgeWorkers":null}]}}}`, `{"data":{"app":{"environments":[{"edgeWorkers":{}}]}}}`, `not json`} {
		for _, mode := range []string{"list", "get", "source"} {
			api, _ := testAPI(t, body)
			var err error
			if mode == "list" {
				_, err = api.List(context.Background(), 42, 7)
			} else {
				_, err = api.Get(context.Background(), 42, 7, "headers", mode == "source")
			}
			if err == nil {
				t.Fatalf("%s accepted %s", mode, body)
			}
		}
	}
	api, _ := testAPI(t, `{"data":{"app":{"environments":[{"edgeWorkers":[]}]}}}`)
	workers, err := api.List(context.Background(), 42, 7)
	if err != nil || workers == nil || len(workers) != 0 {
		t.Fatalf("empty list: %v %v", workers, err)
	}
	worker, err := api.Get(context.Background(), 42, 7, "missing", false)
	if err != nil || worker != nil {
		t.Fatalf("missing: %v %v", worker, err)
	}
}

func TestAPIMutationPayloads(t *testing.T) {
	empty := ""
	input := WriteInput{Name: "headers", WASMBinary: "AGFzbQ==", Source: &empty, Location: LocationValue{Present: true}}
	for _, tc := range []struct {
		field, operation string
		call             func(APIClient) error
		want             map[string]any
	}{
		{"createEdgeWorker", "CreateEdgeWorker", func(a APIClient) error { _, err := a.Create(context.Background(), 7, input); return err }, map[string]any{"environmentId": float64(7), "name": "headers", "wasmBinary": "AGFzbQ==", "source": ""}},
		{"updateEdgeWorker", "UpdateEdgeWorker", func(a APIClient) error { _, err := a.Update(context.Background(), 7, 9, input); return err }, map[string]any{"environmentId": float64(7), "edgeWorkerId": float64(9), "name": "headers", "wasmBinary": "AGFzbQ==", "source": "", "location": nil}},
		{"setEdgeWorkerActive", "SetEdgeWorkerActive", func(a APIClient) error { _, err := a.SetActive(context.Background(), 7, 9, false); return err }, map[string]any{"environmentId": float64(7), "edgeWorkerId": float64(9), "active": false}},
		{"deleteEdgeWorker", "DeleteEdgeWorker", func(a APIClient) error { return a.Delete(context.Background(), 7, 9) }, map[string]any{"environmentId": float64(7), "edgeWorkerId": float64(9)}},
		{"validateEdgeWorker", "ValidateEdgeWorker", func(a APIClient) error {
			result, err := a.Validate(context.Background(), 7, "AGFzbQ==")
			if err == nil && (result.Valid || !reflect.DeepEqual(result.Errors, []string{"invalid"})) {
				t.Errorf("result: %#v", result)
			}
			return err
		}, map[string]any{"environmentId": float64(7), "wasmBinary": "AGFzbQ=="}},
	} {
		t.Run(tc.operation, func(t *testing.T) {
			result := workerJSON
			if tc.field == "deleteEdgeWorker" {
				result = "true"
			}
			if tc.field == "validateEdgeWorker" {
				result = `{"valid":false,"phases":[],"errors":["invalid"]}`
			}
			api, requests := testAPI(t, `{"data":{"`+tc.field+`":`+result+`}}`)
			if err := tc.call(api); err != nil {
				t.Fatal(err)
			}
			if len(*requests) != 1 || (*requests)[0].Operation != tc.operation || !reflect.DeepEqual((*requests)[0].Variables["input"], tc.want) {
				t.Fatalf("requests: %#v", *requests)
			}
			for _, bad := range []string{`{"data":null}`, `{"data":{"` + tc.field + `":null}}`, `{"errors":[{"message":"denied"}]}`} {
				a, _ := testAPI(t, bad)
				if err := tc.call(a); err == nil {
					t.Errorf("accepted %s", bad)
				}
			}
		})
	}
	a, _ := testAPI(t, `{"data":{"deleteEdgeWorker":false}}`)
	if err := a.Delete(context.Background(), 7, 9); err == nil || err.Error() != "deleteEdgeWorker did not confirm deletion." {
		t.Fatalf("delete: %v", err)
	}
}

func TestAPIErrorMiddlewareAndNoMutationRetry(t *testing.T) {
	// Exercise the real middleware without routing our local fixture through a user's proxy.
	for _, key := range []string{"VIP_PROXY", "vip_proxy", "SOCKS_PROXY", "socks_proxy", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy", "VIP_USE_SYSTEM_PROXY"} {
		t.Setenv(key, "")
	}
	for _, status := range []int{200, 401, 503} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			calls, exits := 0, 0
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				w.WriteHeader(status)
				fmt.Fprint(w, `{"errors":[{"message":"denied"}]}`)
			}))
			defer srv.Close()
			var stderr bytes.Buffer
			client := gql.HTTPClientWithMiddleware(srv.URL, "test-token", []gql.Middleware{
				gql.NewErrorMiddleware(gql.ErrorConfig{Stderr: &stderr, Exit: func(int) { exits++ }, ExitOnError: true}),
				gql.NewRetryMiddleware(gql.RetryConfig{MaxAttempts: 3, NoDelay: true}),
			})
			api := APIClient{Client: graphql.NewClient(srv.URL+"/graphql", client)}
			_, err := api.Create(context.Background(), 7, WriteInput{Name: "headers", WASMBinary: "AGFzbQ=="})
			if err == nil || calls != 1 {
				t.Fatalf("calls=%d err=%v", calls, err)
			}
			wantExits := 0
			if status == 401 {
				wantExits = 1
			}
			if exits != wantExits || (status != 401 && stderr.Len() != 0) {
				t.Fatalf("exits=%d stderr=%q", exits, stderr.String())
			}
		})
	}
}

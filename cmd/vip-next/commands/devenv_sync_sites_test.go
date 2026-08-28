package commands

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"
)

type syncSitesRequest struct {
	Variables struct {
		After *string `json:"after"`
		First int64   `json:"first"`
	} `json:"variables"`
}

func TestFetchDevEnvSyncSitesPaginatesStrictly(t *testing.T) {
	var afters []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request syncSitesRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if request.Variables.First != 100 {
			t.Errorf("first = %d, want 100", request.Variables.First)
		}
		after := "<nil>"
		if request.Variables.After != nil {
			after = *request.Variables.After
		}
		afters = append(afters, after)
		w.Header().Set("Content-Type", "application/json")
		if request.Variables.After == nil {
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"wpSitesSDS":{"total":3,"nextCursor":"page-2","nodes":[{"blogId":1,"homeUrl":"https://primary.example.com","siteUrl":"https://primary.example.com/wp"},{"blogId":2,"homeUrl":"https://two.primary.example.com","siteUrl":"https://two.primary.example.com/wp"}]}}]}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"wpSitesSDS":{"total":3,"nextCursor":null,"nodes":[{"blogId":3,"homeUrl":"https://three.primary.example.com","siteUrl":"https://three.primary.example.com/wp"}]}}]}}}`))
	}))
	defer server.Close()

	var progress []string
	sites, issue := fetchDevEnvSyncSites(t.Context(), graphql.NewClient(server.URL, server.Client()), 42, 7, func(line string) {
		progress = append(progress, line)
	})
	if issue != "" {
		t.Fatalf("issue = %q", issue)
	}
	if got, want := afters, []string{"<nil>", "page-2"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("after cursors = %#v, want %#v", got, want)
	}
	if len(sites) != 3 || sites[0].BlogID != 1 || sites[2].BlogID != 3 {
		t.Fatalf("sites = %#v", sites)
	}
	if got, want := progress, []string{"Fetched 2 of 3 sites...", "Fetched 3 of 3 sites..."}; !reflect.DeepEqual(got, want) {
		t.Fatalf("progress = %#v, want %#v", got, want)
	}
}

func TestFetchDevEnvSyncSitesRejectsUnsafeCatalogs(t *testing.T) {
	tests := []struct {
		name      string
		responses []string
		status    int
		wantIssue string
	}{
		{name: "transport", status: http.StatusInternalServerError, wantIssue: "transport"},
		{name: "missing payload", responses: []string{`{"data":{"app":null}}`}, wantIssue: "missing_payload"},
		{name: "empty catalog", responses: []string{`{"data":{"app":{"environments":[{"wpSitesSDS":{"total":0,"nextCursor":null,"nodes":[]}}]}}}`}, wantIssue: "empty_catalog"},
		{name: "nil node", responses: []string{`{"data":{"app":{"environments":[{"wpSitesSDS":{"total":1,"nextCursor":null,"nodes":[null]}}]}}}`}, wantIssue: "invalid_nodes"},
		{name: "total mismatch", responses: []string{`{"data":{"app":{"environments":[{"wpSitesSDS":{"total":2,"nextCursor":null,"nodes":[{"blogId":1,"homeUrl":"https://primary.example.com"}]}}]}}}`}, wantIssue: "total_mismatch"},
		{
			name: "cursor loop",
			responses: []string{
				`{"data":{"app":{"environments":[{"wpSitesSDS":{"total":2,"nextCursor":"same","nodes":[{"blogId":1,"homeUrl":"https://primary.example.com"}]}}]}}}`,
				`{"data":{"app":{"environments":[{"wpSitesSDS":{"total":2,"nextCursor":"same","nodes":[{"blogId":2,"homeUrl":"https://two.primary.example.com"}]}}]}}}`,
			},
			wantIssue: "cursor_loop",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tt.status != 0 {
					http.Error(w, "local test failure", tt.status)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				index := calls
				if index >= len(tt.responses) {
					index = len(tt.responses) - 1
				}
				calls++
				_, _ = fmt.Fprint(w, tt.responses[index])
			}))
			defer server.Close()

			sites, issue := fetchDevEnvSyncSites(t.Context(), graphql.NewClient(server.URL, server.Client()), 42, 7, nil)
			if issue != tt.wantIssue {
				t.Fatalf("issue = %q, want %q; sites=%#v", issue, tt.wantIssue, sites)
			}
			if len(sites) != 0 {
				t.Fatalf("unsafe catalog returned trusted sites: %#v", sites)
			}
		})
	}
}

func TestFetchDevEnvSyncSitesDeduplicatesIdenticalNodes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"wpSitesSDS":{"total":2,"nextCursor":null,"nodes":[{"blogId":1,"homeUrl":"https://primary.example.com","siteUrl":"https://primary.example.com/wp"},{"blogId":1,"homeUrl":"https://primary.example.com","siteUrl":"https://primary.example.com/wp"}]}}]}}}`))
	}))
	defer server.Close()

	sites, issue := fetchDevEnvSyncSites(t.Context(), graphql.NewClient(server.URL, server.Client()), 42, 7, nil)
	if issue != "" || len(sites) != 1 {
		t.Fatalf("sites=%#v issue=%q, want one deduplicated site", sites, issue)
	}
}

func TestFetchDevEnvSyncSitesRejectsConflictingDuplicateIDs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"wpSitesSDS":{"total":2,"nextCursor":null,"nodes":[{"blogId":1,"homeUrl":"https://primary.example.com"},{"blogId":1,"homeUrl":"https://other.example.com"}]}}]}}}`))
	}))
	defer server.Close()

	sites, issue := fetchDevEnvSyncSites(t.Context(), graphql.NewClient(server.URL, server.Client()), 42, 7, nil)
	if issue != "invalid_nodes" || len(sites) != 0 {
		t.Fatalf("sites=%#v issue=%q", sites, issue)
	}
}

func TestFetchDevEnvSyncSitesDoesNotLeakRawTransportErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "secret upstream details", http.StatusBadGateway)
	}))
	defer server.Close()

	_, issue := fetchDevEnvSyncSites(t.Context(), graphql.NewClient(server.URL, server.Client()), 42, 7, nil)
	if strings.Contains(issue, "secret") || issue != "transport" {
		t.Fatalf("issue = %q", issue)
	}
}

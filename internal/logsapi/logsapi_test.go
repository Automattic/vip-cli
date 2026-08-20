package logsapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Khan/genqlient/graphql"
)

// logsServer returns a stub /graphql endpoint that responds with the given
// JSON body for every request. Sufficient because each RecentLogs call
// fires exactly one query.
func logsServer(body string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
}

func TestRecentLogsHappyPath(t *testing.T) {
	srv := logsServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"logs":{"nodes":[{"timestamp":"2024-01-01T00:00:00Z","message":"hello"},{"timestamp":"2024-01-01T00:00:01Z","message":"world"}],"nextCursor":"abc","pollingDelaySeconds":7}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	page, err := RecentLogs(context.Background(), c, 1, 2, "app", 500, nil)
	if err != nil {
		t.Fatalf("RecentLogs: %v", err)
	}
	if len(page.Nodes) != 2 {
		t.Fatalf("Nodes len = %d, want 2 (page=%+v)", len(page.Nodes), page)
	}
	if page.Nodes[0].Timestamp != "2024-01-01T00:00:00Z" || page.Nodes[0].Message != "hello" {
		t.Errorf("Nodes[0] = %+v, want {2024-01-01T00:00:00Z hello}", page.Nodes[0])
	}
	if page.Nodes[1].Timestamp != "2024-01-01T00:00:01Z" || page.Nodes[1].Message != "world" {
		t.Errorf("Nodes[1] = %+v, want {2024-01-01T00:00:01Z world}", page.Nodes[1])
	}
	if page.NextCursor == nil || *page.NextCursor != "abc" {
		t.Errorf("NextCursor = %v, want abc", page.NextCursor)
	}
	if page.PollingDelaySeconds != 7 {
		t.Errorf("PollingDelaySeconds = %d, want 7", page.PollingDelaySeconds)
	}
}

func TestRecentLogsEmpty(t *testing.T) {
	srv := logsServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"logs":{"nodes":[],"nextCursor":null,"pollingDelaySeconds":15}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	page, err := RecentLogs(context.Background(), c, 1, 2, "app", 500, nil)
	if err != nil {
		t.Fatalf("RecentLogs: %v", err)
	}
	if len(page.Nodes) != 0 {
		t.Errorf("Nodes len = %d, want 0; page=%+v", len(page.Nodes), page)
	}
	if page.NextCursor != nil {
		t.Errorf("NextCursor = %v, want nil", page.NextCursor)
	}
	if page.PollingDelaySeconds != 15 {
		t.Errorf("PollingDelaySeconds = %d, want 15", page.PollingDelaySeconds)
	}
}

func TestRecentLogsBatchType(t *testing.T) {
	// Same payload as happy path, but with the batch type — exercising the
	// enum-cast path through gql.AppEnvironmentLogType.
	srv := logsServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"logs":{"nodes":[{"timestamp":"t","message":"m"}],"pollingDelaySeconds":30}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	page, err := RecentLogs(context.Background(), c, 1, 2, "batch", 100, nil)
	if err != nil {
		t.Fatalf("RecentLogs(batch): %v", err)
	}
	if len(page.Nodes) != 1 || page.Nodes[0].Message != "m" {
		t.Errorf("Nodes = %+v, want one {t m}", page.Nodes)
	}
}

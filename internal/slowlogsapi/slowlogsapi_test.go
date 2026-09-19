package slowlogsapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Khan/genqlient/graphql"
)

// slowlogsServer returns a stub /graphql endpoint that responds with the
// given JSON body for every request. Each RecentSlowlogs call fires one
// query — a constant body suffices.
func slowlogsServer(body string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
}

func TestRecentSlowlogsHappyPath(t *testing.T) {
	srv := slowlogsServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"slowlogs":{"nodes":[{"timestamp":"2024-01-01T00:00:00Z","rowsSent":"10","rowsExamined":"1000","queryTime":"1.234","requestUri":"/wp-admin/edit.php","query":"SELECT * FROM wp_posts"},{"timestamp":"2024-01-01T00:00:01Z","rowsSent":"5","rowsExamined":"500","queryTime":"0.567","requestUri":"/wp-login.php","query":"SELECT * FROM wp_users"}],"nextCursor":"xyz","pollingDelaySeconds":60}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	page, err := RecentSlowlogs(context.Background(), c, 1, 2, 500, nil)
	if err != nil {
		t.Fatalf("RecentSlowlogs: %v", err)
	}
	if len(page.Nodes) != 2 {
		t.Fatalf("Nodes len = %d, want 2 (page=%+v)", len(page.Nodes), page)
	}
	got := page.Nodes[0]
	if got.Timestamp != "2024-01-01T00:00:00Z" {
		t.Errorf("Nodes[0].Timestamp = %q", got.Timestamp)
	}
	if got.RowsSent != "10" || got.RowsExamined != "1000" || got.QueryTime != "1.234" {
		t.Errorf("Nodes[0] numeric fields = (%q, %q, %q)", got.RowsSent, got.RowsExamined, got.QueryTime)
	}
	if got.RequestUri != "/wp-admin/edit.php" || got.Query != "SELECT * FROM wp_posts" {
		t.Errorf("Nodes[0] string fields = (%q, %q)", got.RequestUri, got.Query)
	}
	if page.NextCursor == nil || *page.NextCursor != "xyz" {
		t.Errorf("NextCursor = %v, want xyz", page.NextCursor)
	}
	if page.PollingDelaySeconds != 60 {
		t.Errorf("PollingDelaySeconds = %d, want 60", page.PollingDelaySeconds)
	}
}

func TestRecentSlowlogsEmpty(t *testing.T) {
	srv := slowlogsServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"slowlogs":{"nodes":[],"nextCursor":null,"pollingDelaySeconds":30}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	page, err := RecentSlowlogs(context.Background(), c, 1, 2, 500, nil)
	if err != nil {
		t.Fatalf("RecentSlowlogs: %v", err)
	}
	if len(page.Nodes) != 0 {
		t.Errorf("Nodes len = %d, want 0; page=%+v", len(page.Nodes), page)
	}
	if page.NextCursor != nil {
		t.Errorf("NextCursor = %v, want nil", page.NextCursor)
	}
	if page.PollingDelaySeconds != 30 {
		t.Errorf("PollingDelaySeconds = %d, want 30", page.PollingDelaySeconds)
	}
}

func TestRecentSlowlogsNullFieldsAreEmptyStrings(t *testing.T) {
	// Schema declares every node field as nullable String. A null on any
	// field should surface as "" rather than panic on a nil pointer.
	srv := slowlogsServer(`{"data":{"app":{"id":1,"environments":[{"id":2,"slowlogs":{"nodes":[{"timestamp":"t","rowsSent":null,"rowsExamined":null,"queryTime":"0","requestUri":null,"query":"Q"}],"pollingDelaySeconds":30}}]}}}`)
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())

	page, err := RecentSlowlogs(context.Background(), c, 1, 2, 500, nil)
	if err != nil {
		t.Fatalf("RecentSlowlogs: %v", err)
	}
	if len(page.Nodes) != 1 {
		t.Fatalf("Nodes len = %d, want 1", len(page.Nodes))
	}
	got := page.Nodes[0]
	if got.Timestamp != "t" || got.QueryTime != "0" || got.Query != "Q" {
		t.Errorf("non-null fields lost: %+v", got)
	}
	if got.RowsSent != "" || got.RowsExamined != "" || got.RequestUri != "" {
		t.Errorf("null fields should be empty strings, got %+v", got)
	}
}

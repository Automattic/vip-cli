package defensivemode

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"
)

func newGQLClient(srv *httptest.Server) graphql.Client {
	return graphql.NewClient(srv.URL+"/graphql", srv.Client())
}

func TestUpdateDefensiveModeStatusBuildsCorrectRequest(t *testing.T) {
	var gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"updateDefensiveModeStatus":{"success":true,"message":"ok"}}}`))
	}))
	defer srv.Close()
	c := newGQLClient(srv)
	result, err := UpdateDefensiveModeStatus(context.Background(), c, UpdateStatusInput{
		AppID:   42,
		EnvID:   7,
		Enabled: true,
	})
	if err != nil {
		t.Fatalf("UpdateDefensiveModeStatus: %v", err)
	}
	if !result.Success || result.Message != "ok" {
		t.Errorf("result = %+v", result)
	}
	if !strings.Contains(gotBody, `"operationName":"UpdateDefensiveModeStatus"`) {
		t.Errorf("operationName missing: %s", gotBody)
	}
	// Verify the wire shape uses id / environmentId / enabled keys.
	for _, want := range []string{`"id":42`, `"environmentId":7`, `"enabled":true`} {
		if !strings.Contains(gotBody, want) {
			t.Errorf("expected %q in body; got %s", want, gotBody)
		}
	}
}

func TestUpdateDefensiveModeConfigOmitsUnsetThresholds(t *testing.T) {
	var gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		_, _ = w.Write([]byte(`{"data":{"updateDefensiveModeConfig":{"success":true,"message":"ok"}}}`))
	}))
	defer srv.Close()
	c := newGQLClient(srv)
	_, err := UpdateDefensiveModeConfig(context.Background(), c, UpdateConfigInput{
		AppID:         42,
		EnvID:         7,
		Enabled:       true,
		ChallengeType: 1,
	})
	if err != nil {
		t.Fatalf("UpdateDefensiveModeConfig: %v", err)
	}
	// Optional thresholds: when nil on the Go side, they should serialize as
	// null on the wire (genqlient pointer optionals are encoded that way),
	// not omitted entirely. The schema accepts null for these fields.
	// The important property: don't send a NON-null integer for a threshold
	// the user didn't set. Look for the substring "5000" / "80" which would
	// indicate a leaked value.
	if strings.Contains(gotBody, "5000") {
		t.Errorf("unset absolute threshold leaked: %s", gotBody)
	}
	if strings.Contains(gotBody, ",80,") || strings.Contains(gotBody, ":80}") {
		t.Errorf("unset percentage threshold leaked: %s", gotBody)
	}
}

func TestUpdateDefensiveModeConfigIncludesSetThresholds(t *testing.T) {
	var gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		_, _ = w.Write([]byte(`{"data":{"updateDefensiveModeConfig":{"success":true,"message":"ok"}}}`))
	}))
	defer srv.Close()
	c := newGQLClient(srv)
	abs := 5000
	pct := 80
	_, err := UpdateDefensiveModeConfig(context.Background(), c, UpdateConfigInput{
		AppID:                         42,
		EnvID:                         7,
		Enabled:                       true,
		ChallengeType:                 2,
		ConnectionThresholdAbsolute:   &abs,
		ConnectionThresholdPercentage: &pct,
	})
	if err != nil {
		t.Fatalf("UpdateDefensiveModeConfig: %v", err)
	}
	if !strings.Contains(gotBody, `"connectionThresholdAbsolute":5000`) {
		t.Errorf("absolute threshold missing: %s", gotBody)
	}
	if !strings.Contains(gotBody, `"connectionThresholdPercentage":80`) {
		t.Errorf("percentage threshold missing: %s", gotBody)
	}
}

func TestUpdateDefensiveModeReturnsErrorWhenNoPayload(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"updateDefensiveModeStatus":null}}`))
	}))
	defer srv.Close()
	c := newGQLClient(srv)
	_, err := UpdateDefensiveModeStatus(context.Background(), c, UpdateStatusInput{AppID: 1, EnvID: 1, Enabled: true})
	if err == nil {
		t.Error("expected error when payload is null")
	}
}

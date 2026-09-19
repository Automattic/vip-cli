package gql

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"

	json "encoding/json/v2"
)

func TestDecodeIgnoresUnknownTopLevelFields(t *testing.T) {
	type known struct {
		ID   *int64  `json:"id"`
		Name *string `json:"name"`
	}
	payload := []byte(`{"id":42,"name":"x","newField":"surprise","anotherNew":{"nested":1}}`)
	var k known
	if err := json.Unmarshal(payload, &k); err != nil {
		t.Fatalf("decode failed on extra fields — forward-compat lost: %v", err)
	}
	if k.ID == nil || *k.ID != 42 || k.Name == nil || *k.Name != "x" {
		t.Errorf("decoded values wrong: %+v", k)
	}
}

func TestDecodeAcceptsNullForOptionalFields(t *testing.T) {
	type opt struct {
		Name *string `json:"name"`
	}
	var o opt
	if err := json.Unmarshal([]byte(`{"name":null}`), &o); err != nil {
		t.Fatalf("decode failed on null: %v", err)
	}
	if o.Name != nil {
		t.Errorf("null should yield nil pointer; got %v", *o.Name)
	}
}

func TestGenqlientResponseIgnoresUnknownFields(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{"me":{"id":7,"displayName":"x","isVIP":true,"newServerOnlyField":"surprise"}}}`))
	}))
	defer srv.Close()
	c := graphql.NewClient(srv.URL+"/graphql", http.DefaultClient)
	res, err := Me(t.Context(), c)
	if err != nil {
		t.Fatalf("Me: %v", err)
	}
	if res.Me == nil || res.Me.Id == nil || *res.Me.Id != 7 {
		t.Errorf("decoded Me wrong: %+v", res.Me)
	}
}

func TestAuditNoNonPointerOptionals(t *testing.T) {
	type checked struct {
		typ  string
		read func() any
	}
	cases := []checked{
		{typ: "MeMe", read: func() any { return MeMe{} }},
	}
	for _, c := range cases {
		v := c.read()
		fields := reflectExportedFields(v)
		for _, f := range fields {
			if strings.HasPrefix(f.Name, "GetType") || f.Name == "Typename" {
				continue
			}
			if !strings.HasPrefix(f.Type, "*") && !strings.HasPrefix(f.Type, "[]") {
				t.Errorf("%s.%s is %s (expected pointer/slice for forward-compat tolerance)", c.typ, f.Name, f.Type)
			}
		}
	}
}

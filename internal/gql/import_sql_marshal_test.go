package gql

import (
	"encoding/json"
	"strings"
	"testing"
)

// The startImport server resolver calls input.searchReplace.filter(...). If the
// field is omitted from the request (undefined), it crashes with
// "Cannot read properties of undefined (reading 'filter')". Node always sends
// searchReplace: [], so an empty SearchReplace MUST serialize as [] rather than
// be dropped by omitempty. Same applies to urlHeaders on the URL path.
func TestStartImportInputAlwaysSendsSearchReplace(t *testing.T) {
	in := &AppEnvironmentImportInput{
		SearchReplace: []*AppEnvironmentImportSearchReplace{},
	}
	b, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"searchReplace":[]`) {
		t.Fatalf("empty searchReplace dropped (omitempty) — server will crash on .filter(); got: %s", b)
	}
}

// `--search-replace="a"` (no comma) must reach the server as {from:"a"} with
// no `to` key — Node's JSON.stringify drops the undefined arr[1]. A nil *To
// therefore has to be OMITTED, not emitted as null: "to":null and a missing
// `to` are different inputs to the resolver, and "to":"" is worse still
// (delete every occurrence of `from`). Guards the
// @genqlient(for: "AppEnvironmentImportSearchReplace.to", omitempty: true)
// directive in operations/import_sql.graphql.
func TestSearchReplaceOmitsNilTo(t *testing.T) {
	from := "a"
	b, err := json.Marshal(&AppEnvironmentImportSearchReplace{From: &from})
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != `{"from":"a"}` {
		t.Fatalf("got %s, want {\"from\":\"a\"} — a nil To must be omitted, not null", b)
	}
}

// A trailing comma ("a,") is a real second segment in JS, so an explicitly
// empty `to` must still be transmitted.
func TestSearchReplaceKeepsExplicitEmptyTo(t *testing.T) {
	from, to := "a", ""
	b, err := json.Marshal(&AppEnvironmentImportSearchReplace{From: &from, To: &to})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"to":""`) {
		t.Fatalf("got %s, want an explicit \"to\":\"\"", b)
	}
}

func TestStartImportInputAlwaysSendsUrlHeaders(t *testing.T) {
	in := &AppEnvironmentImportInput{
		UrlHeaders: []*RequestHeader{},
	}
	b, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"urlHeaders":[]`) {
		t.Fatalf("empty urlHeaders dropped (omitempty); got: %s", b)
	}
}

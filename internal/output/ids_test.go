package output

import (
	"bytes"
	"testing"
)

func TestRenderIDs(t *testing.T) {
	var buf bytes.Buffer
	rows := OrderedRows{
		{{Key: "id", Value: "FOO"}},
		{{Key: "id", Value: "BAR"}},
		{{Key: "id", Value: "BAZ"}},
	}
	if err := renderIDs(&buf, rows); err != nil {
		t.Fatalf("renderIDs: %v", err)
	}
	want := "FOO BAR BAZ\n"
	if buf.String() != want {
		t.Errorf("got %q, want %q", buf.String(), want)
	}
}

func TestRenderIDsEmpty(t *testing.T) {
	var buf bytes.Buffer
	if err := renderIDs(&buf, OrderedRows{}); err != nil {
		t.Fatalf("renderIDs: %v", err)
	}
	if buf.Len() != 0 {
		t.Errorf("empty input must produce empty output; got %q", buf.String())
	}
}

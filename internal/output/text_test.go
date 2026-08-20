package output

import (
	"bytes"
	"testing"
)

func TestRenderTextOrderedRows(t *testing.T) {
	var buf bytes.Buffer
	rows := OrderedRows{
		{{Key: "timestamp", Value: "2026-06-08T00:00:00Z"}, {Key: "message", Value: "hello"}},
		{{Key: "timestamp", Value: "2026-06-08T00:00:01Z"}, {Key: "message", Value: "world"}},
	}
	if err := renderText(&buf, rows); err != nil {
		t.Fatalf("renderText: %v", err)
	}
	want := "2026-06-08T00:00:00Z hello\n2026-06-08T00:00:01Z world\n"
	if buf.String() != want {
		t.Errorf("got %q, want %q", buf.String(), want)
	}
}

func TestRenderTextEmpty(t *testing.T) {
	var buf bytes.Buffer
	if err := renderText(&buf, OrderedRows{}); err != nil {
		t.Fatalf("renderText: %v", err)
	}
	if buf.Len() != 0 {
		t.Errorf("empty input must produce empty output; got %q", buf.String())
	}
}

package output

import (
	"bytes"
	"testing"
)

func TestRenderKeyValue(t *testing.T) {
	var buf bytes.Buffer
	rows := OrderedRows{
		{{Key: "MY_VAR", Value: "1"}},
		{{Key: "OTHER_VAR", Value: "two"}},
	}
	if err := renderKeyValue(&buf, rows); err != nil {
		t.Fatalf("renderKeyValue: %v", err)
	}
	want := "MY_VAR=1\nOTHER_VAR=two\n"
	if buf.String() != want {
		t.Errorf("got %q, want %q", buf.String(), want)
	}
}

func TestRenderKeyValueTwoColumns(t *testing.T) {
	var buf bytes.Buffer
	rows := OrderedRows{
		{{Key: "key", Value: "MY_VAR"}, {Key: "value", Value: "1"}},
	}
	if err := renderKeyValue(&buf, rows); err != nil {
		t.Fatalf("renderKeyValue: %v", err)
	}
	want := "MY_VAR=1\n"
	if buf.String() != want {
		t.Errorf("got %q, want %q", buf.String(), want)
	}
}

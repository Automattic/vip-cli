package output

import (
	"strings"
	"testing"
)

func TestStripTypenameRemovesField(t *testing.T) {
	in := `{"id":1,"name":"alpha","__typename":"App"}`
	got, err := StripTypename([]byte(in))
	if err != nil {
		t.Fatalf("StripTypename: %v", err)
	}
	if strings.Contains(string(got), "__typename") {
		t.Errorf("__typename not removed: %s", got)
	}
	if !strings.Contains(string(got), `"name":"alpha"`) {
		t.Errorf("other fields lost: %s", got)
	}
}

func TestStripTypenameRecursive(t *testing.T) {
	in := `{"a":{"__typename":"X","b":[{"__typename":"Y","c":2}]}}`
	got, err := StripTypename([]byte(in))
	if err != nil {
		t.Fatalf("StripTypename: %v", err)
	}
	if strings.Count(string(got), "__typename") != 0 {
		t.Errorf("nested __typename not removed: %s", got)
	}
	if !strings.Contains(string(got), `"c":2`) {
		t.Errorf("leaf data lost: %s", got)
	}
}

func TestStripTypenamePreservesArrays(t *testing.T) {
	in := `{"items":[{"id":1,"__typename":"A"},{"id":2,"__typename":"B"}]}`
	got, err := StripTypename([]byte(in))
	if err != nil {
		t.Fatalf("StripTypename: %v", err)
	}
	if strings.Contains(string(got), "__typename") {
		t.Errorf("__typename in array not removed: %s", got)
	}
	if !strings.Contains(string(got), `"id":1`) || !strings.Contains(string(got), `"id":2`) {
		t.Errorf("array entries lost: %s", got)
	}
}

// internal/output/ordered_test.go
package output

import (
	"reflect"
	"testing"
)

func TestOrderedRowKeysInOrder(t *testing.T) {
	r := OrderedRow{
		{Key: "id", Value: 42},
		{Key: "name", Value: "x"},
		{Key: "repo", Value: "wpcomvip/x"},
	}
	got := r.Keys()
	want := []string{"id", "name", "repo"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Keys() = %v, want %v", got, want)
	}
}

func TestOrderedRowValueAt(t *testing.T) {
	r := OrderedRow{{Key: "k", Value: "v"}}
	if r.ValueAt("k") != "v" {
		t.Errorf("ValueAt(k) = %v, want v", r.ValueAt("k"))
	}
	if r.ValueAt("missing") != nil {
		t.Errorf("ValueAt(missing) = %v, want nil", r.ValueAt("missing"))
	}
}

func TestOrderedRowsAllKeysFromFirst(t *testing.T) {
	rs := OrderedRows{
		{{Key: "a", Value: 1}, {Key: "b", Value: 2}},
		{{Key: "a", Value: 3}, {Key: "b", Value: 4}},
	}
	got := rs.Columns()
	want := []string{"a", "b"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Columns() = %v, want %v", got, want)
	}
}

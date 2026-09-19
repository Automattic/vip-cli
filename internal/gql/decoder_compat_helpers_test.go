// Package-level helpers shared by decoder_compat_test.go.
package gql

import (
	"fmt"
	"reflect"
)

// reflectedField is a tiny shape used by the forward-compat audit test.
type reflectedField struct {
	Name string
	Type string
}

// reflectExportedFields enumerates exported fields of v (which may be a
// struct value or pointer to one). Used to enforce the "all generated
// optional fields must be pointers" invariant from genqlient.yaml.
func reflectExportedFields(v any) []reflectedField {
	t := reflect.TypeOf(v)
	if t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct {
		return nil
	}
	out := make([]reflectedField, 0, t.NumField())
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if !f.IsExported() {
			continue
		}
		out = append(out, reflectedField{Name: f.Name, Type: fmt.Sprintf("%v", f.Type)})
	}
	return out
}

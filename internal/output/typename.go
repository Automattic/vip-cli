package output

import (
	json "encoding/json/v2"
)

// StripTypename decodes the input into a generic structure, recursively
// removes every "__typename" key, and re-encodes. Used by the gql layer
// to clean responses before they reach command handlers.
func StripTypename(in []byte) ([]byte, error) {
	var doc any
	if err := json.Unmarshal(in, &doc); err != nil {
		return nil, err
	}
	stripWalk(&doc)
	return json.Marshal(doc, json.Deterministic(true))
}

func stripWalk(v *any) {
	switch t := (*v).(type) {
	case map[string]any:
		delete(t, "__typename")
		for k := range t {
			child := t[k]
			stripWalk(&child)
			t[k] = child
		}
	case []any:
		for i := range t {
			child := t[i]
			stripWalk(&child)
			t[i] = child
		}
	}
}

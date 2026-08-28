// internal/output/ordered.go
package output

// Cell is one column of an OrderedRow.
type Cell struct {
	Key   string
	Value any
}

// OrderedRow is a column-ordered alternative to map[string]any. Used by
// commands whose JSON / CSV / text output must match Node's insertion order
// (Go's map iteration is randomized).
type OrderedRow []Cell

// Keys returns the keys in insertion order.
func (r OrderedRow) Keys() []string {
	out := make([]string, len(r))
	for i, c := range r {
		out[i] = c.Key
	}
	return out
}

// ValueAt returns the value for key, or nil if absent.
func (r OrderedRow) ValueAt(key string) any {
	for _, c := range r {
		if c.Key == key {
			return c.Value
		}
	}
	return nil
}

// OrderedRows is a slice of OrderedRow.
type OrderedRows []OrderedRow

// Columns returns the column key order taken from the first row.
// Empty OrderedRows returns nil.
func (rs OrderedRows) Columns() []string {
	if len(rs) == 0 {
		return nil
	}
	return rs[0].Keys()
}

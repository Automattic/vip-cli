package wpshell

import (
	"slices"
	"testing"
)

func TestRequoteArgs(t *testing.T) {
	// format.ts:135 — wrap each arg in double quotes, escaping inner ".
	got := RequoteArgs([]string{"post", "list", `--search=a "b" c`})
	want := []string{`"post"`, `"list"`, `"--search=a \"b\" c"`}
	if !slices.Equal(got, want) {
		t.Errorf("got %v want %v", got, want)
	}
}

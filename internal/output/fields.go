package output

import (
	"strings"
	"unicode"
)

// HumanizeField mirrors the transform used by the Node CLI's formatData:
// key.split(/(?=[A-Z])/).join(' ').toLowerCase(). The split is deliberately
// ASCII-only, matching JavaScript's [A-Z] character class.
func HumanizeField(field string) string {
	var humanized strings.Builder
	first := true
	for _, r := range field {
		if !first && r >= 'A' && r <= 'Z' {
			humanized.WriteByte(' ')
		}
		humanized.WriteRune(unicode.ToLower(r))
		first = false
	}
	return humanized.String()
}

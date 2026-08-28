package wpshell

import "strings"

// RequoteArgs ports requoteArgs (format.ts:135): wrap each arg in double
// quotes, escaping any inner double quotes.
func RequoteArgs(args []string) []string {
	out := make([]string, len(args))
	for i, a := range args {
		out[i] = `"` + strings.ReplaceAll(a, `"`, `\"`) + `"`
	}
	return out
}

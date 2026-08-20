// Package envalias implements the @app.env pre-parser.
//
// The function Rewrite walks argv left-to-right, stops at the first "--",
// strips the FIRST @app[.env[.instance...]] token, and returns the
// rewritten argv plus the extracted (lowercased) app and env. A second
// alias-shaped token is left in place. Tokens that begin with "@" but
// do not match the alias regex pass through unchanged (Node behavior).
//
// Behavior matches the Node implementation in src/lib/cli/envAlias.ts.
package envalias

import (
	"regexp"
	"strings"
)

// aliasRE matches the full Node isAlias pattern.
var aliasRE = regexp.MustCompile(`^@[A-Za-z0-9._-]+$`)

func Rewrite(argv []string) (rewritten []string, app, env string, err error) {
	rewritten = make([]string, 0, len(argv))
	consumed := false

	for i, tok := range argv {
		if tok == "--" {
			rewritten = append(rewritten, argv[i:]...)
			return rewritten, app, env, nil
		}
		if !consumed && aliasRE.MatchString(tok) {
			app, env = parseAlias(tok)
			consumed = true
			continue
		}
		rewritten = append(rewritten, tok)
	}
	return rewritten, app, env, nil
}

// parseAlias strips "@", lowercases the remainder, splits on the first ".".
// The first segment is the app; the rest (joined on ".") is the env.
// Mirrors src/lib/cli/envAlias.ts:parseEnvAlias.
func parseAlias(tok string) (app, env string) {
	stripped := strings.ToLower(tok[1:])
	parts := strings.SplitN(stripped, ".", 2)
	app = parts[0]
	if len(parts) == 2 {
		env = parts[1]
	}
	return app, env
}

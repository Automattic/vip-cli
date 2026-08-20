package telemetry

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/Automattic/vip/internal/redact"
)

// userPathRE matches the home-directory roots whose next path segment is a
// username. Anchored on the platform conventions rather than on "any absolute
// path", because /usr/local/bin and /etc/hosts are not sensitive and stripping
// them would gut the payload.
var userPathRE = regexp.MustCompile(`(?i)(/Users/|/home/|[A-Z]:\\Users\\)([^/\\:;,'"` + "`" + `\s]+)`)

// ScrubErrorText removes personally identifying and credential material from
// the text of an error before it is attached to a telemetry event.
//
// This exists because cmd/vip-next/main.go registers a cli_error hook that
// posts err.Error() to public-api.wordpress.com. That hook is Go-only — the
// Node CLI has no equivalent and never sends error text anywhere — so every
// byte it carries is surface the rewrite added. vip-next errors routinely
// interpolate absolute paths (import sql, import media, dev-env, and every
// wrapped os.Open failure), and an absolute path carries the account name,
// which is often the user's real name, and the directory tree, which is often a
// client's name.
//
// Removed, in order:
//
//  1. credentials, via internal/redact — presigned query strings, URL userinfo,
//     JWTs, Bearer tokens;
//  2. this process's working directory, temp directory and home directory,
//     longest match first so a cwd nested inside home does not decay to
//     "$HOME/clients/acme-corp";
//  3. any remaining /Users/<name>, /home/<name> or C:\Users\<name>, which is
//     the net for paths that came from a config file, instance data or a server
//     response rather than from this process.
//
// Kept: everything else. A scrubbed message still names the operation, the
// filename, the host and the failure, which is the whole justification for
// scrubbing rather than dropping the hook.
func ScrubErrorText(s string) string {
	s = redact.Text(s)
	for _, r := range scrubRoots() {
		s = strings.ReplaceAll(s, r.path, r.placeholder)
	}
	return userPathRE.ReplaceAllString(s, "$1<redacted-user>")
}

type scrubRoot struct {
	path        string
	placeholder string
}

// scrubRoots returns the directories to anonymise, longest first.
//
// Each root is offered in both its literal and symlink-resolved form: on macOS
// os.TempDir() reports /var/folders/... while anything that actually opened a
// file there reports /private/var/folders/..., and the two must both go.
func scrubRoots() []scrubRoot {
	var roots []scrubRoot
	add := func(path, placeholder string) {
		path = strings.TrimSuffix(filepath.Clean(path), string(filepath.Separator))
		if path == "" || path == string(filepath.Separator) {
			return
		}
		roots = append(roots, scrubRoot{path: path, placeholder: placeholder})
		if resolved, err := filepath.EvalSymlinks(path); err == nil && resolved != path {
			roots = append(roots, scrubRoot{path: resolved, placeholder: placeholder})
		}
	}

	if cwd, err := os.Getwd(); err == nil {
		add(cwd, "<cwd>")
	}
	add(os.TempDir(), "<tmp>")
	if home, err := os.UserHomeDir(); err == nil {
		add(home, "<home>")
	}

	// Longest first: the working directory is usually inside the home
	// directory, and replacing home first would leave the project path visible.
	sort.SliceStable(roots, func(i, j int) bool {
		return len(roots[i].path) > len(roots[j].path)
	})
	return roots
}

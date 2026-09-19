package version

import "strings"

// Stamp is the Version ldflag. A 5.* git tag is a Go release; anything else
// (PRs, 4.x npm tags) is 5.0.0-dev.<shortCommit>.
func Stamp(tag, shortCommit string) string {
	if strings.HasPrefix(tag, "5.") {
		return tag
	}
	if shortCommit == "" {
		shortCommit = "unknown"
	}
	return "5.0.0-dev." + shortCommit
}

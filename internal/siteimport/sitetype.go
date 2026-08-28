package siteimport

import (
	"regexp"
	"strings"
)

// MultilineCapture ports getMultilineStatement (validations/utils.ts:7):
// captures statements that start with a line matching the pattern and
// run until a line ending in ';'.
type MultilineCapture struct {
	re         *regexp.Regexp
	capturing  bool
	statements [][]string
}

// NewMultilineCapture compiles a literal start-of-statement pattern (the
// only caller uses "INSERT INTO `wp_site`" — site-type.ts:18).
func NewMultilineCapture(pattern string) *MultilineCapture {
	return &MultilineCapture{re: regexp.MustCompile(regexp.QuoteMeta(pattern))}
}

// Feed processes one line and returns the statements captured so far.
// Each statement is the list of its lines, like Node's string[][].
func (m *MultilineCapture) Feed(line string) [][]string {
	start := m.re.MatchString(line)
	end := (start || m.capturing) && strings.HasSuffix(line, ";")
	if start {
		m.capturing = true
		m.statements = append(m.statements, nil)
	}
	if m.capturing {
		idx := len(m.statements) - 1
		m.statements[idx] = append(m.statements[idx], line)
	}
	if end {
		m.capturing = false
	}
	return m.statements
}

var (
	// SQL_WP_SITE_DOMAINS_REGEX — is-multisite-domain-mapped.ts:23.
	wpSiteDomainsRE = regexp.MustCompile(`\(1,'([^']+)'`)
	whitespaceRE    = regexp.MustCompile(`\s`)
)

// GetPrimaryDomainFromSQL ports getPrimaryDomainFromSQL
// (is-multisite-domain-mapped.ts:18): extract the domain of blog ID 1
// from the first captured INSERT INTO `wp_site` statement.
func GetPrimaryDomainFromSQL(statements [][]string) string {
	if len(statements) == 0 {
		return ""
	}
	normalized := whitespaceRE.ReplaceAllString(strings.Join(statements[0], ""), "")
	if m := wpSiteDomainsRE.FindStringSubmatch(normalized); m != nil {
		return m[1]
	}
	return ""
}

// MaybeSearchReplacePrimaryDomain ports maybeSearchReplacePrimaryDomain
// (is-multisite-domain-mapped.ts:36). NOTE: Node splits on ',' WITHOUT
// trimming here (unlike the replacement list built for the binary) —
// kept bug-for-bug.
func MaybeSearchReplacePrimaryDomain(domain string, searchReplace []string) string {
	for _, pair := range searchReplace {
		parts := strings.Split(pair, ",")
		if len(parts) >= 2 && parts[0] == domain {
			return parts[1]
		}
	}
	return domain
}

package sqlvalidation

import "regexp"

// Multi-site detection regexes — straight port of Node's
// src/lib/validations/is-multi-site-sql-dump.ts.
var (
	// SQL_CREATE_TABLE_IS_MULTISITE_REGEX from is-multi-site-sql-dump.ts:1
	//   /^CREATE TABLE(?: IF NOT EXISTS)? `?(wp_\d+_[a-z0-9_]*|wp_blogs)/i
	sqlCreateTableIsMultisiteRE = regexp.MustCompile(
		`(?i)^CREATE TABLE(?: IF NOT EXISTS)? ` + "`" + `?(wp_\d+_[a-z0-9_]*|wp_blogs)`,
	)
	// SQL_CONTAINS_MULTISITE_WP_USERS_REGEX from is-multi-site-sql-dump.ts:3
	//   /`spam` tinyint\(2\)|`deleted` tinyint\(2\)/i
	sqlContainsMultisiteWPUsersRE = regexp.MustCompile(
		"(?i)`spam` tinyint\\(2\\)|`deleted` tinyint\\(2\\)",
	)
)

// IsMultiSiteSQLDumpLine returns true if the given SQL line is evidence the
// dump comes from a WordPress multisite install. Mirrors Node's
// sqlDumpLineIsMultiSite (is-multi-site-sql-dump.ts).
//
// Two heuristics, OR'd together:
//   - CREATE TABLE [IF NOT EXISTS] wp_<N>_<name> OR wp_blogs
//   - lines defining the wp_users multisite columns (`spam` tinyint(2),
//     `deleted` tinyint(2))
func IsMultiSiteSQLDumpLine(line string) bool {
	return sqlCreateTableIsMultisiteRE.MatchString(line) ||
		sqlContainsMultisiteWPUsersRE.MatchString(line)
}

package sqlvalidation

import "testing"

// Cases mirror Node's __tests__/lib/validations/is-multi-site-sql-dump.js.
func TestIsMultiSiteSQLDumpLine(t *testing.T) {
	type tc struct {
		line string
		want bool
	}
	cases := []tc{
		// True: multisite CREATE TABLE lines.
		{"CREATE TABLE wp_2_posts", true},
		{"CREATE TABLE wp_23_posts", true},
		{"CREATE TABLE wp_2345235_posts", true},
		{"CREATE TABLE wp_blogs", true},
		{"CREATE TABLE IF NOT EXISTS wp_2_posts", true},
		// False: single-site CREATE TABLE.
		{"CREATE TABLE wp_posts", false},
		{"CREATE TABLE IF NOT EXISTS wp_posts", false},
		// True: multisite wp_users columns.
		{"`spam` tinyint(2) NOT NULL DEFAULT 0,", true},
		{"`deleted` tinyint(2) NOT NULL DEFAULT 0,", true},
		// Case-insensitive parity.
		{"create table wp_5_options", true},
		// Empty.
		{"", false},
	}
	for _, c := range cases {
		if got := IsMultiSiteSQLDumpLine(c.line); got != c.want {
			t.Errorf("IsMultiSiteSQLDumpLine(%q) = %v, want %v", c.line, got, c.want)
		}
	}
}

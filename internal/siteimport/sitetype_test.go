package siteimport

import "testing"

func TestMultilineStatementCapture(t *testing.T) {
	cap := NewMultilineCapture("INSERT INTO `wp_site`")
	lines := []string{
		"CREATE TABLE `wp_site2` (id INT);",
		"INSERT INTO `wp_site` (id, domain) VALUES",
		"(1,'example.com','/');",
		"SELECT 1;",
	}
	var stmts [][]string
	for _, l := range lines {
		stmts = cap.Feed(l)
	}
	if len(stmts) != 1 || len(stmts[0]) != 2 {
		t.Fatalf("stmts = %v", stmts)
	}
}

func TestMultilineStatementCaptureSingleLine(t *testing.T) {
	cap := NewMultilineCapture("INSERT INTO `wp_site`")
	stmts := cap.Feed("INSERT INTO `wp_site` VALUES (1,'a.com','/');")
	if len(stmts) != 1 || len(stmts[0]) != 1 {
		t.Fatalf("stmts = %v", stmts)
	}
	// a second statement opens a new capture slot
	stmts = cap.Feed("INSERT INTO `wp_site` VALUES (2,'b.com','/');")
	if len(stmts) != 2 {
		t.Fatalf("stmts = %v", stmts)
	}
}

func TestGetPrimaryDomainFromSQL(t *testing.T) {
	stmts := [][]string{{
		"INSERT INTO `wp_site` (id, domain, path) VALUES",
		"(1,'multisite.example.com','/');",
	}}
	if got := GetPrimaryDomainFromSQL(stmts); got != "multisite.example.com" {
		t.Errorf("domain = %q", got)
	}
	if got := GetPrimaryDomainFromSQL(nil); got != "" {
		t.Errorf("empty stmts should give %q, got %q", "", got)
	}
}

func TestMaybeSearchReplacePrimaryDomain(t *testing.T) {
	got := MaybeSearchReplacePrimaryDomain("old.example.com",
		[]string{"other.com,new-other.com", "old.example.com,new.example.com"})
	if got != "new.example.com" {
		t.Errorf("got %q", got)
	}
	if got := MaybeSearchReplacePrimaryDomain("keep.com", nil); got != "keep.com" {
		t.Errorf("got %q", got)
	}
	// Node does NOT trim around the comma in this path — bug-for-bug.
	got = MaybeSearchReplacePrimaryDomain("a.com", []string{"a.com, b.com"})
	if got != " b.com" {
		t.Errorf("untrimmed replacement expected, got %q", got)
	}
}

package devenv

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestBuildDomainRepairSQLUsesGuardedTransaction(t *testing.T) {
	script, err := buildDomainRepairSQL([]DomainRepair{
		{BlogID: 9, SourceDomain: "mapped.example.net", TargetDomain: "mapped-example-net-b9.mysite.vipdev.site"},
		{BlogID: 0, SourceDomain: "recovery.example.net", TargetDomain: "recovered.mysite.vipdev.site"},
		{BlogID: 9, SourceDomain: "mapped.example.net", TargetDomain: "mapped-example-net-b9.mysite.vipdev.site"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"DROP PROCEDURE IF EXISTS vip_sync_update_blog_domains;",
		"DECLARE EXIT HANDLER FOR SQLEXCEPTION",
		"ROLLBACK;",
		"RESIGNAL;",
		"information_schema.tables",
		"table_schema = 'wordpress' AND table_name = 'wp_blogs'",
		"START TRANSACTION;",
		"UPDATE wordpress.wp_blogs SET domain = 'mapped-example-net-b9.mysite.vipdev.site' WHERE blog_id = 9 AND domain = 'mapped.example.net';",
		"UPDATE wordpress.wp_blogs SET domain = 'recovered.mysite.vipdev.site' WHERE domain = 'recovery.example.net';",
		"COMMIT;",
		"CALL vip_sync_update_blog_domains();",
	} {
		if !strings.Contains(script, want) {
			t.Errorf("script missing %q:\n%s", want, script)
		}
	}
	if got := strings.Count(script, "mapped-example-net-b9.mysite.vipdev.site"); got != 1 {
		t.Fatalf("deduplicated target count = %d, want 1:\n%s", got, script)
	}
	if strings.Index(script, "START TRANSACTION;") > strings.Index(script, "UPDATE wordpress.wp_blogs") ||
		strings.Index(script, "UPDATE wordpress.wp_blogs") > strings.Index(script, "COMMIT;") {
		t.Fatalf("transaction statement order is wrong:\n%s", script)
	}
}

func TestBuildDomainRepairSQLRejectsConflictsAndInvalidDomains(t *testing.T) {
	tests := []struct {
		name    string
		repairs []DomainRepair
	}{
		{
			name: "conflicting targets",
			repairs: []DomainRepair{
				{BlogID: 1, SourceDomain: "old.example.com", TargetDomain: "one.mysite.vipdev.site"},
				{BlogID: 2, SourceDomain: "old.example.com", TargetDomain: "two.mysite.vipdev.site"},
			},
		},
		{
			name: "invalid source",
			repairs: []DomainRepair{
				{BlogID: 1, SourceDomain: "old.example.com' OR 1=1 --", TargetDomain: "one.mysite.vipdev.site"},
			},
		},
		{
			name: "negative blog id",
			repairs: []DomainRepair{
				{BlogID: -1, SourceDomain: "old.example.com", TargetDomain: "one.mysite.vipdev.site"},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := buildDomainRepairSQL(tt.repairs); err == nil {
				t.Fatal("buildDomainRepairSQL accepted unsafe repairs")
			}
		})
	}
}

type recordingDomainRepairRunner struct {
	composeCalls      [][]string
	composeStdinCalls [][]string
	stdin             string
	stdinErr          error
	cleanupErr        error
}

func (r *recordingDomainRepairRunner) Compose(_ context.Context, _ string, args ...string) error {
	r.composeCalls = append(r.composeCalls, append([]string(nil), args...))
	if len(r.composeCalls) > 1 {
		return r.cleanupErr
	}
	return nil
}

func (r *recordingDomainRepairRunner) ComposeStdin(_ context.Context, _ string, input io.Reader, args ...string) error {
	r.composeStdinCalls = append(r.composeStdinCalls, append([]string(nil), args...))
	b, _ := io.ReadAll(input)
	r.stdin = string(b)
	return r.stdinErr
}

func TestRepairBlogDomainsCleansProcedureAfterFailure(t *testing.T) {
	runner := &recordingDomainRepairRunner{stdinErr: errors.New("local mysql failed")}
	err := repairBlogDomainsWith(context.Background(), runner, "mysite", []DomainRepair{
		{BlogID: 9, SourceDomain: "mapped.example.net", TargetDomain: "mapped.mysite.vipdev.site"},
	})
	var postImportErr *PostImportRepairError
	if !errors.As(err, &postImportErr) {
		t.Fatalf("err = %T %v, want PostImportRepairError", err, err)
	}
	if !strings.Contains(err.Error(), "database was imported") || !strings.Contains(err.Error(), "no partial domain repairs were committed") {
		t.Fatalf("error does not explain post-import state: %v", err)
	}
	if len(runner.composeStdinCalls) != 1 || !strings.Contains(runner.stdin, "CREATE PROCEDURE") {
		t.Fatalf("stdin calls=%#v script=%q", runner.composeStdinCalls, runner.stdin)
	}
	if len(runner.composeCalls) != 2 {
		t.Fatalf("cleanup calls = %#v, want preflight and deferred cleanup", runner.composeCalls)
	}
	for _, call := range runner.composeCalls {
		if strings.Join(call, " ") != "exec -T php wp --allow-root db query DROP PROCEDURE IF EXISTS vip_sync_update_blog_domains" {
			t.Fatalf("cleanup argv = %#v", call)
		}
	}
}

func TestRepairBlogDomainsNoRepairsIsNoop(t *testing.T) {
	runner := &recordingDomainRepairRunner{}
	if err := repairBlogDomainsWith(context.Background(), runner, "mysite", nil); err != nil {
		t.Fatal(err)
	}
	if len(runner.composeCalls) != 0 || len(runner.composeStdinCalls) != 0 {
		t.Fatalf("runner called for empty repair set: %#v %#v", runner.composeCalls, runner.composeStdinCalls)
	}
}

func TestRepairBlogDomainsReportsCleanupFailureAfterCommit(t *testing.T) {
	runner := &recordingDomainRepairRunner{cleanupErr: errors.New("drop failed")}
	err := repairBlogDomainsWith(context.Background(), runner, "mysite", []DomainRepair{
		{BlogID: 9, SourceDomain: "mapped.example.net", TargetDomain: "mapped.mysite.vipdev.site"},
	})
	var postImportErr *PostImportRepairError
	if !errors.As(err, &postImportErr) || !postImportErr.RepairsCommitted {
		t.Fatalf("err = %#v, want committed cleanup error", err)
	}
	if !strings.Contains(err.Error(), "domain repairs committed") {
		t.Fatalf("cleanup error state is ambiguous: %v", err)
	}
}

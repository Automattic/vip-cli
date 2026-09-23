package commands

import (
	"bytes"
	"io"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestImportSQLDebugSafeRemoteSummary(t *testing.T) {
	stub := &importStub{}
	srv := stub.start(t)
	SetConfig(Config{GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()), APIHost: srv.URL, Token: "TOKEN_SECRET"})
	defer SetConfig(Config{})
	t.Setenv("VIP_IMPORT_SQL_INTERVAL_MS", "1")
	restore := stubImportPrompts("EXAMPLE.COM", true)
	defer restore()
	cmd := ImportSQLCmd()
	var logs bytes.Buffer
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(debuglog.WithLogger(importCtx(42, 7, 2), "@automattic/vip:bin:vip-import-sql", &logs))
	_ = cmd.Flags().Set("header", "Authorization: HEADER_SECRET")
	_ = cmd.Flags().Set("search-replace", "FROM_SECRET,TO_SECRET")
	if err := runImportSQL(cmd, []string{"https://URL_SECRET.example/dump.sql?token=QUERY_SECRET"}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"remote=true", "headers=1", "replacements=1", "Import queued"} {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("missing %q in %s", want, &logs)
		}
	}
	for _, secret := range []string{"TOKEN_SECRET", "HEADER_SECRET", "FROM_SECRET", "TO_SECRET", "URL_SECRET", "QUERY_SECRET"} {
		if strings.Contains(logs.String(), secret) {
			t.Errorf("leaked %q", secret)
		}
	}
}

func TestImportSQLDebugValidation(t *testing.T) {
	for _, skip := range []bool{false, true} {
		t.Run(map[bool]string{false: "validate", true: "skip"}[skip], func(t *testing.T) {
			cmd := ImportSQLCmd()
			var logs bytes.Buffer
			cmd.SetOut(io.Discard)
			cmd.SetContext(debuglog.WithLogger(importCtx(42, 7, 2), "*", &logs))
			path := writeTempSQL(t, cleanWPDump)
			if _, err := validateAndGetTableNames(cmd, nil, 42, 7, path, skip, nil, false); err != nil {
				t.Fatal(err)
			}
			want := "target_multisite=false dump_multisite=false"
			if skip {
				want = "Validation was skipped"
			}
			if !strings.Contains(logs.String(), want) {
				t.Errorf("missing %q in %s", want, &logs)
			}
			if strings.Contains(logs.String(), path) || strings.Contains(logs.String(), "wp_posts") {
				t.Errorf("file data leaked: %s", &logs)
			}
		})
	}
}

func TestImportMediaDebugSafeRemoteSummary(t *testing.T) {
	stub := &mediaStub{progressBodies: []string{mediaProgress("COMPLETED", 1, 1, "")}}
	setupMediaTest(t, stub)
	cmd := ImportMediaCmd()
	var logs bytes.Buffer
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(debuglog.WithLogger(importCtx(42, 7, 2), "vip:vip-import-media", &logs))
	if err := runImportMedia(cmd, []string{"https://URL_SECRET.example/up.zip?token=QUERY_SECRET"}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"local=false", "Import queued"} {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("missing %q in %s", want, &logs)
		}
	}
	for _, secret := range []string{"URL_SECRET", "QUERY_SECRET"} {
		if strings.Contains(logs.String(), secret) {
			t.Errorf("leaked %q", secret)
		}
	}
}

func TestImportValidationDebugSilence(t *testing.T) {
	for _, namespace := range []string{"", "vip:unrelated"} {
		t.Run(namespace, func(t *testing.T) {
			cmd := ImportSQLCmd()
			var logs, stdout bytes.Buffer
			cmd.SetOut(&stdout)
			cmd.SetContext(debuglog.WithLogger(importCtx(42, 7, 2), namespace, &logs))
			if _, err := validateAndGetTableNames(cmd, nil, 42, 7, "UNREAD_PATH_SECRET", true, nil, false); err != nil {
				t.Fatal(err)
			}
			if logs.Len() != 0 {
				t.Errorf("unexpected diagnostics: %s", &logs)
			}
			if stdout.String() != "Skipping SQL file validation.\n" {
				t.Errorf("changed stdout: %q", stdout.String())
			}
		})
	}
}

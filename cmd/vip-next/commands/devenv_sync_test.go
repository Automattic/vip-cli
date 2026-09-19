package commands

import (
	"errors"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/devenv"
)

func TestDevEnvSyncSQLSearchReplaceFlagIsRepeatableWithShortForm(t *testing.T) {
	cmd := newDevEnvSyncSQLCmd()
	if err := cmd.ParseFlags([]string{"-r", "one.example,a.local.vipdev.site", "--search-replace", "two.example,b.local.vipdev.site"}); err != nil {
		t.Fatal(err)
	}
	got, err := cmd.Flags().GetStringArray("search-replace")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(got, "|") != "one.example,a.local.vipdev.site|two.example,b.local.vipdev.site" {
		t.Fatalf("search-replace = %#v", got)
	}
}

func TestResolveSyncMappingsNonInteractivePrintsCopyableFlags(t *testing.T) {
	cmd := &cobra.Command{Use: "test"}
	draft := devenv.PlanDraft{Unresolved: []devenv.UnresolvedMapping{
		{Source: "missing.example.com", Reason: "transport"},
		{Source: "deep.mapped.example.net/path", Reason: "missing_sds_mapping"},
	}}
	_, err := resolveSyncMappingsCore(cmd, draft, "mysite.vipdev.site", false, nil)
	if err == nil {
		t.Fatal("expected non-interactive unresolved error")
	}
	for _, want := range []string{"missing.example.com", "deep.mapped.example.net/path", `-r "missing.example.com,`, "mysite.vipdev.site"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error missing %q: %v", want, err)
		}
	}
}

func TestResolveSyncMappingsInteractiveCollectsPairsAndCancels(t *testing.T) {
	cmd := &cobra.Command{Use: "test"}
	draft := devenv.PlanDraft{Unresolved: []devenv.UnresolvedMapping{{Source: "missing.example.com"}}}
	pairs, err := resolveSyncMappingsCore(cmd, draft, "mysite.vipdev.site", true,
		func(_ *cobra.Command, message, fallback string) (string, error) {
			if !strings.Contains(message, "missing.example.com") || fallback == "" {
				t.Fatalf("message=%q fallback=%q", message, fallback)
			}
			return "recovered.mysite.vipdev.site", nil
		})
	if err != nil || len(pairs) != 1 || pairs[0] != "missing.example.com,recovered.mysite.vipdev.site" {
		t.Fatalf("pairs=%#v err=%v", pairs, err)
	}

	_, err = resolveSyncMappingsCore(cmd, draft, "mysite.vipdev.site", true,
		func(*cobra.Command, string, string) (string, error) { return "", errors.New("interrupt") })
	if !errors.Is(err, devenv.ErrSyncCancelled) {
		t.Fatalf("cancel err = %v", err)
	}
}

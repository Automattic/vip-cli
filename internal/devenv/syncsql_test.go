package devenv

import (
	"context"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestFindSiteHomeURL(t *testing.T) {
	line := `('siteurl','https://example.com',`
	if got := findSiteHomeURL(line); got != "https://example.com" {
		t.Fatalf("findSiteHomeURL = %q", got)
	}
	if got := findSiteHomeURL(`('blogname','My Site',`); got != "" {
		t.Fatalf("findSiteHomeURL non-url = %q", got)
	}
}

func TestExtractSiteURLsSortedByLengthDesc(t *testing.T) {
	sql := strings.Join([]string{
		`('home','https://example.com',`,
		`('siteurl','https://example.com/sub',`,
		`('home','https://example.com',`, // duplicate
	}, "\n")
	got, err := extractSiteURLs(strings.NewReader(sql))
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"https://example.com/sub", "https://example.com"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("extractSiteURLs = %v, want %v", got, want)
	}
}

func TestSyncSQLOrchestration(t *testing.T) {
	var events []string
	var importPairs []string
	deps := SyncDeps{
		ExportTo: func(_ context.Context, dest string) error {
			events = append(events, "export")
			return os.WriteFile(dest, []byte(`('siteurl','https://mapped.example.com',`), 0o644)
		},
		FetchSites: func(context.Context) ([]SyncSite, string) {
			events = append(events, "fetch")
			return []SyncSite{
				{BlogID: 1, HomeURL: "https://primary.example.com"},
				{BlogID: 2, HomeURL: "https://mapped.example.com"},
			}, ""
		},
		ImportFile: func(_ context.Context, slug, file string, pairs []string) error {
			events = append(events, "import")
			importPairs = pairs
			return nil
		},
		RepairDomains: func(_ context.Context, slug string, repairs []DomainRepair) error {
			events = append(events, "repair")
			if len(repairs) != 1 || repairs[0].BlogID != 2 {
				t.Fatalf("repairs = %#v", repairs)
			}
			return nil
		},
		RefreshHosts: func(context.Context) error {
			events = append(events, "hosts")
			return nil
		},
	}
	if err := syncSQLWith(context.Background(), SyncOptions{
		Slug: "mysite", Domain: "vipdev.site", IsMultisite: true,
	}, deps); err != nil {
		t.Fatal(err)
	}
	if want := []string{"export", "fetch", "import", "repair", "hosts"}; !reflect.DeepEqual(events, want) {
		t.Fatalf("events = %#v, want %#v", events, want)
	}
	joined := strings.Join(importPairs, " ")
	if !strings.Contains(joined, "mapped.example.com,mapped-example-com-b2.mysite.vipdev.site") {
		t.Fatalf("search-replace pair missing/wrong: %v", importPairs)
	}
}

func TestSyncSQLRecoveryRebuildsBeforeExactlyOneImport(t *testing.T) {
	var events []string
	imports := 0
	deps := SyncDeps{
		ExportTo: func(_ context.Context, dest string) error {
			events = append(events, "export")
			return os.WriteFile(dest, []byte(`('home','https://missing.example.com',`), 0o644)
		},
		FetchSites: func(context.Context) ([]SyncSite, string) {
			events = append(events, "fetch")
			return nil, "transport"
		},
		ResolveDraft: func(draft PlanDraft) ([]string, error) {
			events = append(events, "resolve")
			if len(draft.Unresolved) != 1 || draft.Unresolved[0].Source != "missing.example.com" {
				t.Fatalf("draft = %#v", draft)
			}
			return []string{"missing.example.com,recovered.mysite.vipdev.site"}, nil
		},
		ImportFile: func(context.Context, string, string, []string) error {
			events = append(events, "import")
			imports++
			return nil
		},
		RepairDomains: func(context.Context, string, []DomainRepair) error {
			events = append(events, "repair")
			return nil
		},
		RefreshHosts: func(context.Context) error {
			events = append(events, "hosts")
			return nil
		},
	}
	if err := syncSQLWith(context.Background(), SyncOptions{
		Slug: "mysite", Domain: "vipdev.site", IsMultisite: true,
	}, deps); err != nil {
		t.Fatal(err)
	}
	if imports != 1 {
		t.Fatalf("imports = %d, want exactly 1", imports)
	}
	if want := []string{"export", "fetch", "resolve", "import", "repair", "hosts"}; !reflect.DeepEqual(events, want) {
		t.Fatalf("events = %#v, want %#v", events, want)
	}
}

func TestSyncSQLCancellationAndUnresolvedStopBeforeImport(t *testing.T) {
	tests := []struct {
		name       string
		resolve    func(PlanDraft) ([]string, error)
		wantErr    bool
		wantCancel bool
	}{
		{name: "cancel", resolve: func(PlanDraft) ([]string, error) { return nil, ErrSyncCancelled }, wantCancel: true},
		{name: "still unresolved", resolve: func(PlanDraft) ([]string, error) { return nil, nil }, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			imported := false
			var logs []string
			err := syncSQLWith(context.Background(), SyncOptions{
				Slug: "mysite", Domain: "vipdev.site", IsMultisite: true,
			}, SyncDeps{
				ExportTo: func(_ context.Context, dest string) error {
					return os.WriteFile(dest, []byte(`('home','https://missing.example.com',`), 0o644)
				},
				FetchSites:   func(context.Context) ([]SyncSite, string) { return nil, "transport" },
				ResolveDraft: tt.resolve,
				ImportFile: func(context.Context, string, string, []string) error {
					imported = true
					return nil
				},
				RepairDomains: func(context.Context, string, []DomainRepair) error { return nil },
				RefreshHosts:  func(context.Context) error { return nil },
				Log:           func(line string) { logs = append(logs, line) },
			})
			if tt.wantErr && err == nil {
				t.Fatal("expected unresolved error")
			}
			if tt.wantCancel && (err != nil || !strings.Contains(strings.Join(logs, "\n"), "cancelled")) {
				t.Fatalf("cancel err=%v logs=%#v", err, logs)
			}
			if imported {
				t.Fatal("import called without a complete final plan")
			}
		})
	}
}

func TestSyncSQLStopsLaterPhasesAfterFailure(t *testing.T) {
	importErr := errors.New("import failed")
	repairErr := errors.New("repair failed")
	tests := []struct {
		name       string
		importErr  error
		repairErr  error
		hostErr    error
		wantEvents []string
		wantHost   bool
	}{
		{name: "import", importErr: importErr, wantEvents: []string{"import"}},
		{name: "repair", repairErr: repairErr, wantEvents: []string{"import", "repair"}},
		{name: "hosts", hostErr: errors.New("sudo declined"), wantEvents: []string{"import", "repair", "hosts"}, wantHost: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var events []string
			err := syncSQLWith(context.Background(), SyncOptions{Slug: "mysite", Domain: "vipdev.site"}, SyncDeps{
				ExportTo: func(_ context.Context, dest string) error {
					return os.WriteFile(dest, []byte(`('home','https://single.example.com',`), 0o644)
				},
				ImportFile: func(context.Context, string, string, []string) error {
					events = append(events, "import")
					return tt.importErr
				},
				RepairDomains: func(context.Context, string, []DomainRepair) error {
					events = append(events, "repair")
					return tt.repairErr
				},
				RefreshHosts: func(context.Context) error {
					events = append(events, "hosts")
					return tt.hostErr
				},
			})
			if err == nil {
				t.Fatal("expected phase error")
			}
			if !reflect.DeepEqual(events, tt.wantEvents) {
				t.Fatalf("events=%#v want=%#v", events, tt.wantEvents)
			}
			var hostErr *HostRefreshError
			if errors.As(err, &hostErr) != tt.wantHost {
				t.Fatalf("HostRefreshError=%t want=%t; err=%v", errors.As(err, &hostErr), tt.wantHost, err)
			}
		})
	}
}

package devenv

import (
	"strings"
	"testing"
)

func mappingsBySource(t *testing.T, draft PlanDraft) map[string]URLMapping {
	t.Helper()
	out := make(map[string]URLMapping, len(draft.Plan.SearchReplace))
	for _, mapping := range draft.Plan.SearchReplace {
		out[mapping.Source] = mapping
	}
	return out
}

func TestBuildSyncPlanAutomaticTargets(t *testing.T) {
	input := PlanInput{
		IsMultisite: true,
		BaseHost:    "mysite.vipdev.site",
		ActiveURLs: []string{
			"https://domain.com/",
			"https://domain.com/subsite/",
			"https://subsite.domain.com",
			"https://sub.subsite.domain.com",
			"https://mapped.example.net",
		},
		Sites: []SyncSite{
			{BlogID: 1, HomeURL: "https://domain.com", SiteURL: "https://domain.com/wp"},
			{BlogID: 2, HomeURL: "https://domain.com/subsite/", SiteURL: "https://domain.com/subsite/wp"},
			{BlogID: 3, HomeURL: "https://subsite.domain.com", SiteURL: "https://subsite.domain.com/wp"},
			{BlogID: 7, HomeURL: "https://sub.subsite.domain.com", SiteURL: "https://sub.subsite.domain.com/wp"},
			{BlogID: 9, HomeURL: "https://mapped.example.net", SiteURL: "https://mapped.example.net/wp"},
		},
	}

	draft, err := BuildSyncPlan(input)
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.Unresolved) != 0 {
		t.Fatalf("unresolved = %#v", draft.Unresolved)
	}
	got := mappingsBySource(t, draft)
	want := map[string]string{
		"domain.com":             "mysite.vipdev.site",
		"domain.com/subsite":     "mysite.vipdev.site/subsite",
		"subsite.domain.com":     "subsite.mysite.vipdev.site",
		"sub.subsite.domain.com": "sub-subsite-b7.mysite.vipdev.site",
		"mapped.example.net":     "mapped-example-net-b9.mysite.vipdev.site",
	}
	for source, target := range want {
		mapping, ok := got[source]
		if !ok {
			t.Errorf("missing mapping for %q in %#v", source, got)
			continue
		}
		if mapping.Target != target || mapping.Origin != MappingSDS {
			t.Errorf("mapping[%q] = %#v, want target=%q origin=%q", source, mapping, target, MappingSDS)
		}
	}
	if len(got) != len(want) {
		t.Fatalf("mapping count = %d, want %d: %#v", len(got), len(want), got)
	}
}

func TestBuildSyncPlanExplicitPrecedenceAndRecovery(t *testing.T) {
	input := PlanInput{
		IsMultisite: true,
		BaseHost:    "mysite.vipdev.site",
		ActiveURLs: []string{
			"https://mapped.example.net",
			"https://mapped.example.net/shop",
			"https://missing.example.org/path",
		},
		Sites: []SyncSite{
			{BlogID: 1, HomeURL: "https://primary.example.com"},
			{BlogID: 9, HomeURL: "https://mapped.example.net"},
		},
		Overrides: []string{
			"mapped.example.net,custom.mysite.vipdev.site",
			"mapped.example.net/shop,custom.mysite.vipdev.site/special",
		},
		Recoveries: []string{
			"missing.example.org,recovered.mysite.vipdev.site",
		},
	}

	draft, err := BuildSyncPlan(input)
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.Unresolved) != 0 {
		t.Fatalf("unresolved = %#v", draft.Unresolved)
	}
	got := mappingsBySource(t, draft)
	if mapping := got["mapped.example.net"]; mapping.Target != "custom.mysite.vipdev.site" || mapping.Origin != MappingOverride {
		t.Errorf("host override = %#v", mapping)
	}
	if mapping := got["mapped.example.net/shop"]; mapping.Target != "custom.mysite.vipdev.site/special" || mapping.Origin != MappingOverride {
		t.Errorf("path override = %#v", mapping)
	}
	if mapping := got["missing.example.org/path"]; mapping.Target != "recovered.mysite.vipdev.site/path" || mapping.Origin != MappingRecovery {
		t.Errorf("host recovery = %#v", mapping)
	}
}

func TestBuildSyncPlanSDSOutageCanBeRecovered(t *testing.T) {
	input := PlanInput{
		IsMultisite:  true,
		BaseHost:     "mysite.vipdev.site",
		ActiveURLs:   []string{"https://mapped.example.net"},
		CatalogIssue: "transport",
	}

	draft, err := BuildSyncPlan(input)
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.Unresolved) != 1 || draft.Unresolved[0].Source != "mapped.example.net" {
		t.Fatalf("unresolved = %#v", draft.Unresolved)
	}

	input.Recoveries = []string{"mapped.example.net,mapped.mysite.vipdev.site"}
	draft, err = BuildSyncPlan(input)
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.Unresolved) != 0 {
		t.Fatalf("recovered draft unresolved = %#v", draft.Unresolved)
	}
	if got := mappingsBySource(t, draft)["mapped.example.net"]; got.Target != "mapped.mysite.vipdev.site" || got.BlogID != 0 {
		t.Fatalf("recovery mapping = %#v", got)
	}
}

func TestBuildSyncPlanPartialExportOnlyRepairsActiveSites(t *testing.T) {
	draft, err := BuildSyncPlan(PlanInput{
		IsMultisite: true,
		BaseHost:    "mysite.vipdev.site",
		ActiveURLs:  []string{"https://second.primary.example.com"},
		Sites: []SyncSite{
			{BlogID: 1, HomeURL: "https://primary.example.com"},
			{BlogID: 2, HomeURL: "https://second.primary.example.com"},
			{BlogID: 3, HomeURL: "https://third.primary.example.com"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.Plan.DomainRepairs) != 1 || draft.Plan.DomainRepairs[0].BlogID != 2 {
		t.Fatalf("domain repairs = %#v, want only blog 2", draft.Plan.DomainRepairs)
	}
}

func TestBuildSyncPlanNormalizesIDNAAndSourcePorts(t *testing.T) {
	draft, err := BuildSyncPlan(PlanInput{
		IsMultisite: true,
		BaseHost:    "mysite.vipdev.site",
		ActiveURLs:  []string{"HTTPS://BÜCHER.example:8080/"},
		Sites: []SyncSite{
			{BlogID: 1, HomeURL: "https://primary.example.com"},
			{BlogID: 4, HomeURL: "https://xn--bcher-kva.example:8080"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	got := mappingsBySource(t, draft)["xn--bcher-kva.example:8080"]
	if got.Target != "xn-bcher-kva-example-b4.mysite.vipdev.site" {
		t.Fatalf("IDNA mapping = %#v", got)
	}
	if len(draft.Plan.DomainRepairs) != 1 || draft.Plan.DomainRepairs[0].SourceDomain != "xn--bcher-kva.example" {
		t.Fatalf("IDNA repair = %#v", draft.Plan.DomainRepairs)
	}
}

func TestBuildSyncPlanRejectsUnroutableExplicitTargets(t *testing.T) {
	for _, pair := range []string{
		"source.example.com,foreign.example.com",
		"source.example.com,deep.label.mysite.vipdev.site",
		"source.example.com,mapped.mysite.vipdev.site:8443",
	} {
		t.Run(pair, func(t *testing.T) {
			_, err := BuildSyncPlan(PlanInput{
				BaseHost:   "mysite.vipdev.site",
				ActiveURLs: []string{"https://source.example.com"},
				Overrides:  []string{pair},
			})
			if err == nil {
				t.Fatalf("BuildSyncPlan accepted %q", pair)
			}
		})
	}
}

func TestBuildSyncPlanRejectsConflictingDomainRepairs(t *testing.T) {
	_, err := BuildSyncPlan(PlanInput{
		IsMultisite:  true,
		BaseHost:     "mysite.vipdev.site",
		ActiveURLs:   []string{"https://source.example.com/a", "https://source.example.com/b"},
		CatalogIssue: "transport",
		Overrides: []string{
			"source.example.com/a,a.mysite.vipdev.site",
			"source.example.com/b,b.mysite.vipdev.site",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "conflicting domain repair") {
		t.Fatalf("err = %v, want conflicting domain repair", err)
	}
}

func TestBuildSyncPlanTruncatesFlattenedLabelsAndSortsLongestFirst(t *testing.T) {
	longLabel := strings.Repeat("a", 50) + "." + strings.Repeat("b", 40) + ".example.net"
	draft, err := BuildSyncPlan(PlanInput{
		IsMultisite: true,
		BaseHost:    "mysite.vipdev.site",
		ActiveURLs:  []string{"https://primary.example.com", "https://primary.example.com/a/long/path", "https://" + longLabel},
		Sites: []SyncSite{
			{BlogID: 1, HomeURL: "https://primary.example.com"},
			{BlogID: 2, HomeURL: "https://primary.example.com/a/long/path"},
			{BlogID: 123, HomeURL: "https://" + longLabel},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := draft.Plan.SearchReplace; len(got) != 3 || got[1].Source != "primary.example.com/a/long/path" || got[2].Source != "primary.example.com" {
		t.Fatalf("search-replace order = %#v", got)
	}
	for i := 1; i < len(draft.Plan.SearchReplace); i++ {
		if len(draft.Plan.SearchReplace[i-1].Source) < len(draft.Plan.SearchReplace[i].Source) {
			t.Fatalf("search-replace is not longest-first: %#v", draft.Plan.SearchReplace)
		}
	}
	for _, host := range draft.Plan.RequiredHosts {
		label := strings.Split(host, ".")[0]
		if len(label) > 63 {
			t.Fatalf("generated label %q is %d bytes", label, len(label))
		}
	}
}

func TestBuildSyncPlanSingleSitePreservesPaths(t *testing.T) {
	draft, err := BuildSyncPlan(PlanInput{
		BaseHost:   "mysite.vipdev.site",
		ActiveURLs: []string{"https://single.example.com", "https://single.example.com/wp"},
	})
	if err != nil {
		t.Fatal(err)
	}
	got := mappingsBySource(t, draft)
	if got["single.example.com"].Target != "mysite.vipdev.site" || got["single.example.com/wp"].Target != "mysite.vipdev.site/wp" {
		t.Fatalf("single-site mappings = %#v", got)
	}
}

package devenv

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// findSiteHomeURL extracts a siteurl/home URL from a SQL line, or "".
// Ports findSiteHomeUrl (dev-env-sync-sql.ts).
//
// Note: Go's regexp/RE2 does not support backreferences (\1), so we enumerate
// both quote flavours explicitly with two alternation branches.
var siteHomeRe = regexp.MustCompile(
	`(?:'(?:siteurl|home)',\s*'([Hh][Tt][Tt][Pp][Ss]?://[^']+)'` +
		`|"(?:siteurl|home)",\s*"([Hh][Tt][Tt][Pp][Ss]?://[^"]+)")`,
)

func findSiteHomeURL(sql string) string {
	m := siteHomeRe.FindStringSubmatch(sql)
	if m == nil {
		return ""
	}
	// m[1] is the single-quote capture, m[2] is the double-quote capture.
	raw := m[1]
	if raw == "" {
		raw = m[2]
	}
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" {
		return ""
	}
	return raw
}

// extractSiteURLs scans a SQL stream for siteurl/home URLs, dedupes, strips a
// trailing slash, and sorts longest-first (so longest URLs replace first).
// Ports extractSiteUrls (dev-env-sync-sql.ts).
func extractSiteURLs(r io.Reader) ([]string, error) {
	set := map[string]struct{}{}
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 1024*1024), 16*1024*1024) // SQL lines can be long
	for sc.Scan() {
		u := findSiteHomeURL(sc.Text())
		if u == "" {
			continue
		}
		u = strings.TrimRight(u, "/")
		set[u] = struct{}{}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(set))
	for u := range set {
		out = append(out, u)
	}
	sort.Slice(out, func(i, j int) bool { return len(out[i]) > len(out[j]) })
	return out, nil
}

// landoDomainFor returns "<slug>.<domain>" for the search-replace target.
func landoDomainFor(slug, domain string) string { return slug + "." + domain }

type SyncOptions struct {
	Slug        string
	Domain      string
	IsMultisite bool
	Overrides   []string
}

var ErrSyncCancelled = errors.New("SQL sync cancelled")

type UnresolvedMappingsError struct {
	Mappings []UnresolvedMapping
}

func (e *UnresolvedMappingsError) Error() string {
	if e == nil || len(e.Mappings) == 0 {
		return "multisite sync has unresolved URL mappings"
	}
	values := make([]string, 0, len(e.Mappings))
	for _, mapping := range e.Mappings {
		values = append(values, mapping.Source)
	}
	return "multisite sync has unresolved URL mappings: " + strings.Join(values, ", ")
}

type HostRefreshError struct {
	Slug string
	Err  error
}

func (e *HostRefreshError) Error() string {
	return fmt.Sprintf(
		"SQL sync completed, but offline hostname setup is incomplete.\nRun `vip dev-env start --slug %s` to retry host configuration: %v",
		e.Slug,
		e.Err,
	)
}

func (e *HostRefreshError) Unwrap() error { return e.Err }

// SyncDeps injects every I/O boundary so planning and exactly-once import
// behavior can be verified without Docker or a remote API.
type SyncDeps struct {
	// ExportTo exports the production DB to a local SQL file at dest.
	ExportTo func(ctx context.Context, dest string) error
	// FetchSites reads the complete SDS catalog. A non-empty issue means the
	// catalog is unsafe for automatic mapping and explicit recovery is required.
	FetchSites func(ctx context.Context) (sites []SyncSite, issue string)
	// ResolveDraft supplies explicit recovery pairs for an unresolved plan.
	ResolveDraft func(draft PlanDraft) ([]string, error)
	// ImportFile imports file into the local env, applying "from,to" pairs.
	ImportFile func(ctx context.Context, slug, file string, pairs []string) error
	// RepairDomains applies guarded wp_blogs updates after a successful import.
	RepairDomains func(ctx context.Context, slug string, repairs []DomainRepair) error
	// RefreshHosts rebuilds the globally owned offline hosts snapshot.
	RefreshHosts func(ctx context.Context) error
	// Log, when set, receives progress messages (Node parity console.log lines).
	Log func(msg string)
}

// syncSQLWith runs export -> inspect -> SDS -> plan/recovery -> import ->
// guarded repair -> offline host refresh. Planning and prompting finish before
// ImportFile is called, and ImportFile is called at most once.
func syncSQLWith(ctx context.Context, options SyncOptions, deps SyncDeps) error {
	logf := func(msg string) {
		if deps.Log != nil {
			deps.Log(msg)
		}
	}
	if options.Slug == "" || options.Domain == "" {
		return errors.New("devenv: sync slug and domain are required")
	}
	if deps.ExportTo == nil || deps.ImportFile == nil || deps.RepairDomains == nil || deps.RefreshHosts == nil {
		return errors.New("devenv: incomplete SQL sync dependencies")
	}
	if options.IsMultisite && deps.FetchSites == nil {
		return errors.New("devenv: multisite SQL sync requires an SDS catalog adapter")
	}

	tmp, err := os.MkdirTemp("", "vip-dev-env-sync-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)

	sqlFile := filepath.Join(tmp, "sql-export.sql")
	if err := deps.ExportTo(ctx, sqlFile); err != nil {
		return err
	}

	logf("Extracting site urls from the SQL file...")
	f, err := os.Open(sqlFile)
	if err != nil {
		return err
	}
	urls, err := extractSiteURLs(f)
	_ = f.Close()
	if err != nil {
		return err
	}

	var sites []SyncSite
	catalogIssue := ""
	if options.IsMultisite {
		logf("Fetching list of sites for database sync...")
		sites, catalogIssue = deps.FetchSites(ctx)
	}

	logf("Generating search-replace configuration...")
	planInput := PlanInput{
		IsMultisite:  options.IsMultisite,
		BaseHost:     landoDomainFor(options.Slug, options.Domain),
		ActiveURLs:   urls,
		Sites:        sites,
		Overrides:    options.Overrides,
		CatalogIssue: catalogIssue,
	}
	draft, err := BuildSyncPlan(planInput)
	if err != nil {
		return err
	}
	if len(draft.Unresolved) > 0 {
		if deps.ResolveDraft == nil {
			return &UnresolvedMappingsError{Mappings: draft.Unresolved}
		}
		recoveries, resolveErr := deps.ResolveDraft(draft)
		if errors.Is(resolveErr, ErrSyncCancelled) {
			logf("SQL sync cancelled; local database was not modified.")
			return nil
		}
		if resolveErr != nil {
			return resolveErr
		}
		planInput.Recoveries = recoveries
		draft, err = BuildSyncPlan(planInput)
		if err != nil {
			return err
		}
		if len(draft.Unresolved) > 0 {
			return &UnresolvedMappingsError{Mappings: draft.Unresolved}
		}
	}

	pairs := make([]string, 0, len(draft.Plan.SearchReplace))
	for _, mapping := range draft.Plan.SearchReplace {
		pairs = append(pairs, mapping.Source+","+mapping.Target)
	}

	logf("Running the following search-replace operations on the SQL file:")
	for _, mapping := range draft.Plan.SearchReplace {
		logf(fmt.Sprintf("  [%s] %s -> %s", mapping.Origin, mapping.Source, mapping.Target))
	}

	logf("Importing the SQL file...")
	if err := deps.ImportFile(ctx, options.Slug, sqlFile, pairs); err != nil {
		return err
	}
	logf("✓ SQL file imported")
	if err := deps.RepairDomains(ctx, options.Slug, draft.Plan.DomainRepairs); err != nil {
		return err
	}
	if err := deps.RefreshHosts(ctx); err != nil {
		return &HostRefreshError{Slug: options.Slug, Err: err}
	}
	return nil
}

// SyncSQL executes a fully-adapted SQL sync. The command layer supplies the
// platform and interactive boundaries; internal/devenv owns local import,
// repair, and host behavior through those injected functions.
func SyncSQL(ctx context.Context, options SyncOptions, deps SyncDeps) error {
	return syncSQLWith(ctx, options, deps)
}

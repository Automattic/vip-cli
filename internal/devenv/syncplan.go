package devenv

import (
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/net/idna"
)

// SyncSite is the SDS metadata needed to plan one network site's URL and
// wp_blogs domain rewrites.
type SyncSite struct {
	BlogID  int64
	HomeURL string
	SiteURL string
}

type MappingOrigin string

const (
	MappingSDS      MappingOrigin = "sds"
	MappingOverride MappingOrigin = "override"
	MappingRecovery MappingOrigin = "recovery"
)

type URLMapping struct {
	Source string
	Target string
	BlogID int64
	Origin MappingOrigin
}

type DomainRepair struct {
	BlogID       int64
	SourceDomain string
	TargetDomain string
}

type UnresolvedMapping struct {
	Source string
	Reason string
}

type PlanInput struct {
	IsMultisite  bool
	BaseHost     string
	ActiveURLs   []string
	Sites        []SyncSite
	Overrides    []string
	Recoveries   []string
	CatalogIssue string
}

type SyncPlan struct {
	SearchReplace []URLMapping
	DomainRepairs []DomainRepair
	RequiredHosts []string
}

type PlanDraft struct {
	Plan       SyncPlan
	Unresolved []UnresolvedMapping
}

type normalizedSyncURL struct {
	Host     string
	Port     string
	Path     string
	Rendered string
}

func normalizeSyncURL(raw string, target bool) (normalizedSyncURL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return normalizedSyncURL{}, errors.New("URL mapping value is empty")
	}

	parseValue := raw
	if !strings.Contains(raw, "://") {
		parseValue = "https://" + raw
	}
	u, err := url.Parse(parseValue)
	if err != nil || u.Hostname() == "" || u.User != nil {
		return normalizedSyncURL{}, fmt.Errorf("invalid URL mapping value %q", raw)
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return normalizedSyncURL{}, fmt.Errorf("unsupported URL scheme %q", u.Scheme)
	}
	if u.RawQuery != "" || u.Fragment != "" {
		return normalizedSyncURL{}, fmt.Errorf("URL mapping value %q cannot contain a query or fragment", raw)
	}

	host, err := idna.Lookup.ToASCII(strings.TrimSuffix(strings.ToLower(u.Hostname()), "."))
	if err != nil || !validDNSHost(host) {
		return normalizedSyncURL{}, fmt.Errorf("invalid hostname %q", u.Hostname())
	}
	port := u.Port()
	if target && port != "" {
		return normalizedSyncURL{}, errors.New("local mapping targets cannot include a port")
	}
	path := strings.TrimSuffix(u.EscapedPath(), "/")
	if path == "/" {
		path = ""
	}
	renderedHost := host
	if port != "" {
		renderedHost += ":" + port
	}
	return normalizedSyncURL{
		Host:     host,
		Port:     port,
		Path:     path,
		Rendered: renderedHost + path,
	}, nil
}

func validDNSHost(host string) bool {
	if host == "" || len(host) > 253 {
		return false
	}
	for _, label := range strings.Split(host, ".") {
		if label == "" || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, c := range label {
			if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '-' {
				return false
			}
		}
	}
	return true
}

type explicitSyncMapping struct {
	source normalizedSyncURL
	target normalizedSyncURL
	origin MappingOrigin
	used   bool
}

func parseExplicitPairs(values []string, origin MappingOrigin, baseHost string) ([]explicitSyncMapping, error) {
	out := make([]explicitSyncMapping, 0, len(values))
	seen := map[string]string{}
	for _, value := range values {
		rawSource, rawTarget, ok := strings.Cut(value, ",")
		if !ok {
			return nil, fmt.Errorf("invalid search-replace mapping %q: expected source,target", value)
		}
		source, err := normalizeSyncURL(rawSource, false)
		if err != nil {
			return nil, fmt.Errorf("invalid mapping source: %w", err)
		}
		target, err := normalizeSyncURL(rawTarget, true)
		if err != nil {
			return nil, fmt.Errorf("invalid mapping target: %w", err)
		}
		if !targetInsideNamespace(target.Host, baseHost) {
			return nil, fmt.Errorf("mapping target %q is outside the local environment namespace %q", target.Rendered, baseHost)
		}
		if previous, exists := seen[source.Rendered]; exists && previous != target.Rendered {
			return nil, fmt.Errorf("conflicting %s mappings for %q", origin, source.Rendered)
		}
		if previous, exists := seen[source.Rendered]; exists && previous == target.Rendered {
			continue
		}
		seen[source.Rendered] = target.Rendered
		out = append(out, explicitSyncMapping{source: source, target: target, origin: origin})
	}
	return out, nil
}

func targetInsideNamespace(host, baseHost string) bool {
	if host == baseHost {
		return true
	}
	suffix := "." + baseHost
	if !strings.HasSuffix(host, suffix) {
		return false
	}
	prefix := strings.TrimSuffix(host, suffix)
	return prefix != "" && !strings.Contains(prefix, ".")
}

func pathPrefixMatch(path, prefix string) bool {
	return path == prefix || strings.HasPrefix(path, prefix+"/")
}

func appendURLPath(base, suffix string) string {
	if suffix == "" {
		return base
	}
	return strings.TrimSuffix(base, "/") + "/" + strings.TrimPrefix(suffix, "/")
}

func explicitTargetFor(active normalizedSyncURL, mappings []explicitSyncMapping) (URLMapping, int, bool) {
	best := -1
	bestPathLen := -1
	for i := range mappings {
		candidate := mappings[i]
		if candidate.source.Host != active.Host {
			continue
		}
		if candidate.source.Port != "" && candidate.source.Port != active.Port {
			continue
		}
		if candidate.source.Path != "" {
			if !pathPrefixMatch(active.Path, candidate.source.Path) {
				continue
			}
			if len(candidate.source.Path) > bestPathLen {
				best = i
				bestPathLen = len(candidate.source.Path)
			}
			continue
		}
		if best == -1 {
			best = i
			bestPathLen = 0
		}
	}
	if best < 0 {
		return URLMapping{}, 0, false
	}
	candidate := mappings[best]
	target := candidate.target.Rendered
	if candidate.source.Path == "" {
		target = appendURLPath(target, active.Path)
	} else {
		remainder := strings.TrimPrefix(active.Path, candidate.source.Path)
		target = appendURLPath(target, remainder)
	}
	return URLMapping{Source: active.Rendered, Target: target, Origin: candidate.origin}, best, true
}

type indexedSyncSite struct {
	site SyncSite
}

func indexSyncSites(sites []SyncSite) (string, map[string]indexedSyncSite, string) {
	byBlogID := map[int64]SyncSite{}
	conflictingIDs := map[int64]bool{}
	for _, site := range sites {
		if site.BlogID <= 0 {
			continue
		}
		if previous, exists := byBlogID[site.BlogID]; exists {
			if previous.HomeURL != site.HomeURL || previous.SiteURL != site.SiteURL {
				conflictingIDs[site.BlogID] = true
			}
			continue
		}
		byBlogID[site.BlogID] = site
	}
	if len(conflictingIDs) > 0 {
		return "", nil, "conflicting_blog_ids"
	}

	primary, ok := byBlogID[1]
	if !ok || strings.TrimSpace(primary.HomeURL) == "" {
		return "", nil, "missing_primary_site"
	}
	primaryURL, err := normalizeSyncURL(primary.HomeURL, false)
	if err != nil {
		return "", nil, "invalid_primary_site"
	}

	index := map[string]indexedSyncSite{}
	ambiguous := map[string]bool{}
	for _, site := range byBlogID {
		for _, raw := range []string{site.HomeURL, site.SiteURL} {
			if strings.TrimSpace(raw) == "" {
				continue
			}
			normalized, err := normalizeSyncURL(raw, false)
			if err != nil {
				continue
			}
			if previous, exists := index[normalized.Rendered]; exists && previous.site.BlogID != site.BlogID {
				ambiguous[normalized.Rendered] = true
				continue
			}
			index[normalized.Rendered] = indexedSyncSite{site: site}
		}
	}
	for raw := range ambiguous {
		delete(index, raw)
	}
	return primaryURL.Host, index, ""
}

func flattenDNSLabel(value string) string {
	var b strings.Builder
	lastHyphen := false
	for _, c := range value {
		isAlphaNum := c >= 'a' && c <= 'z' || c >= '0' && c <= '9'
		if isAlphaNum {
			b.WriteRune(c)
			lastHyphen = false
			continue
		}
		if !lastHyphen {
			b.WriteByte('-')
			lastHyphen = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func flattenedLabel(host string, blogID int64, baseHost string) (string, error) {
	if blogID <= 0 {
		return "", errors.New("automatic flattened mappings require a positive blog ID")
	}
	readable := flattenDNSLabel(host)
	suffix := "-b" + strconv.FormatInt(blogID, 10)
	maxReadable := 63 - len(suffix)
	if maxReadable < 1 {
		return "", fmt.Errorf("blog ID %d is too long for a DNS label", blogID)
	}
	if len(readable) > maxReadable {
		readable = strings.TrimRight(readable[:maxReadable], "-")
	}
	if readable == "" {
		readable = "site"
		if len(readable) > maxReadable {
			readable = readable[:maxReadable]
		}
	}
	label := readable + suffix
	if !validDNSHost(label + "." + baseHost) {
		return "", fmt.Errorf("generated hostname %q is not a valid DNS name", label+"."+baseHost)
	}
	return label, nil
}

func automaticTarget(source normalizedSyncURL, primaryHost, baseHost string, blogID int64) (string, error) {
	targetHost := baseHost
	if source.Host != primaryHost {
		if relative, ok := strings.CutSuffix(source.Host, "."+primaryHost); ok && relative != "" {
			if !strings.Contains(relative, ".") {
				targetHost = relative + "." + baseHost
			} else {
				label, err := flattenedLabel(relative, blogID, baseHost)
				if err != nil {
					return "", err
				}
				targetHost = label + "." + baseHost
			}
		} else {
			label, err := flattenedLabel(source.Host, blogID, baseHost)
			if err != nil {
				return "", err
			}
			targetHost = label + "." + baseHost
		}
	}
	if !targetInsideNamespace(targetHost, baseHost) || !validDNSHost(targetHost) {
		return "", fmt.Errorf("generated hostname %q is outside the routable namespace", targetHost)
	}
	return targetHost + source.Path, nil
}

func normalizeActiveURLs(values []string) ([]normalizedSyncURL, error) {
	seen := map[string]bool{}
	out := make([]normalizedSyncURL, 0, len(values))
	for _, value := range values {
		normalized, err := normalizeSyncURL(value, false)
		if err != nil {
			return nil, fmt.Errorf("invalid active site URL: %w", err)
		}
		if seen[normalized.Rendered] {
			continue
		}
		seen[normalized.Rendered] = true
		out = append(out, normalized)
	}
	return out, nil
}

func buildDomainRepairs(mappings []URLMapping) ([]DomainRepair, error) {
	bySourceTarget := map[string]map[string]bool{}
	seen := map[string]bool{}
	var out []DomainRepair
	for _, mapping := range mappings {
		source, err := normalizeSyncURL(mapping.Source, false)
		if err != nil {
			return nil, err
		}
		target, err := normalizeSyncURL(mapping.Target, true)
		if err != nil {
			return nil, err
		}
		if source.Host == target.Host {
			continue
		}
		if bySourceTarget[source.Host] == nil {
			bySourceTarget[source.Host] = map[string]bool{}
		}
		bySourceTarget[source.Host][target.Host] = true
		if len(bySourceTarget[source.Host]) > 1 {
			return nil, fmt.Errorf("conflicting domain repair for %q", source.Host)
		}
		key := fmt.Sprintf("%d\x00%s\x00%s", mapping.BlogID, source.Host, target.Host)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, DomainRepair{
			BlogID:       mapping.BlogID,
			SourceDomain: source.Host,
			TargetDomain: target.Host,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].BlogID != out[j].BlogID {
			return out[i].BlogID < out[j].BlogID
		}
		if out[i].SourceDomain != out[j].SourceDomain {
			return out[i].SourceDomain < out[j].SourceDomain
		}
		return out[i].TargetDomain < out[j].TargetDomain
	})
	return out, nil
}

// BuildSyncPlan returns a deterministic, side-effect-free draft. Unresolved
// mappings are data, not errors, so a caller may collect recovery pairs and
// rebuild the plan before any import takes place.
func BuildSyncPlan(input PlanInput) (PlanDraft, error) {
	base, err := normalizeSyncURL(input.BaseHost, true)
	if err != nil || base.Path != "" {
		if err == nil {
			err = errors.New("base host cannot include a path")
		}
		return PlanDraft{}, fmt.Errorf("invalid local base host: %w", err)
	}
	active, err := normalizeActiveURLs(input.ActiveURLs)
	if err != nil {
		return PlanDraft{}, err
	}

	overrides, err := parseExplicitPairs(input.Overrides, MappingOverride, base.Host)
	if err != nil {
		return PlanDraft{}, err
	}
	recoveries, err := parseExplicitPairs(input.Recoveries, MappingRecovery, base.Host)
	if err != nil {
		return PlanDraft{}, err
	}
	explicit := append(overrides, recoveries...)

	primaryHost := ""
	siteIndex := map[string]indexedSyncSite{}
	catalogIssue := input.CatalogIssue
	if input.IsMultisite && catalogIssue == "" {
		primaryHost, siteIndex, catalogIssue = indexSyncSites(input.Sites)
	}

	var mappings []URLMapping
	var unresolved []UnresolvedMapping
	for _, source := range active {
		if mapping, explicitIndex, ok := explicitTargetFor(source, explicit); ok {
			explicit[explicitIndex].used = true
			if mapping.Origin == MappingOverride {
				if indexed, exists := siteIndex[source.Rendered]; exists {
					mapping.BlogID = indexed.site.BlogID
				}
			}
			mappings = append(mappings, mapping)
			continue
		}

		if !input.IsMultisite {
			mappings = append(mappings, URLMapping{
				Source: source.Rendered,
				Target: base.Host + source.Path,
				Origin: MappingSDS,
			})
			continue
		}
		if catalogIssue != "" {
			unresolved = append(unresolved, UnresolvedMapping{Source: source.Rendered, Reason: catalogIssue})
			continue
		}
		indexed, exists := siteIndex[source.Rendered]
		if !exists {
			unresolved = append(unresolved, UnresolvedMapping{Source: source.Rendered, Reason: "missing_sds_mapping"})
			continue
		}
		target, targetErr := automaticTarget(source, primaryHost, base.Host, indexed.site.BlogID)
		if targetErr != nil {
			unresolved = append(unresolved, UnresolvedMapping{Source: source.Rendered, Reason: targetErr.Error()})
			continue
		}
		mappings = append(mappings, URLMapping{
			Source: source.Rendered,
			Target: target,
			BlogID: indexed.site.BlogID,
			Origin: MappingSDS,
		})
	}

	// Explicit mappings are recovery inputs in their own right. Retain a pair
	// that was not matched by SQL URL extraction so unusual dumps still have a
	// deliberate user-controlled escape hatch.
	for _, mapping := range explicit {
		if mapping.used {
			continue
		}
		mappings = append(mappings, URLMapping{
			Source: mapping.source.Rendered,
			Target: mapping.target.Rendered,
			Origin: mapping.origin,
		})
	}

	// Deduplicate exact mappings and reject any source assigned two targets.
	bySource := map[string]URLMapping{}
	for _, mapping := range mappings {
		if previous, exists := bySource[mapping.Source]; exists {
			if previous.Target != mapping.Target {
				return PlanDraft{}, fmt.Errorf("conflicting URL mappings for %q", mapping.Source)
			}
			continue
		}
		bySource[mapping.Source] = mapping
	}
	mappings = mappings[:0]
	for _, mapping := range bySource {
		mappings = append(mappings, mapping)
	}
	sort.Slice(mappings, func(i, j int) bool {
		if len(mappings[i].Source) != len(mappings[j].Source) {
			return len(mappings[i].Source) > len(mappings[j].Source)
		}
		return mappings[i].Source < mappings[j].Source
	})
	sort.Slice(unresolved, func(i, j int) bool { return unresolved[i].Source < unresolved[j].Source })

	repairs := []DomainRepair(nil)
	if input.IsMultisite {
		repairs, err = buildDomainRepairs(mappings)
		if err != nil {
			return PlanDraft{}, err
		}
	}
	hostSet := map[string]bool{}
	for _, mapping := range mappings {
		target, targetErr := normalizeSyncURL(mapping.Target, true)
		if targetErr != nil {
			return PlanDraft{}, targetErr
		}
		hostSet[target.Host] = true
	}
	hosts := make([]string, 0, len(hostSet))
	for host := range hostSet {
		hosts = append(hosts, host)
	}
	sort.Strings(hosts)

	return PlanDraft{
		Plan: SyncPlan{
			SearchReplace: mappings,
			DomainRepairs: repairs,
			RequiredHosts: hosts,
		},
		Unresolved: unresolved,
	}, nil
}

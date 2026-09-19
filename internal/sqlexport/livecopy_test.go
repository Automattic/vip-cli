package sqlexport

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	json "encoding/json/v2"
)

func TestParseLiveCopyCLIOptionsExclusivity(t *testing.T) {
	_, err := ParseLiveCopyCLIOptions("cfg.json", []string{"wp_posts"}, nil, "")
	if err == nil || !strings.Contains(err.Error(), "The --config-file option cannot be used with the --table, --site-id, or --wpcli-command options.") {
		t.Errorf("err = %v", err)
	}
	_, err = ParseLiveCopyCLIOptions("", []string{"wp_posts"}, nil, "wp post list")
	if err == nil || !strings.Contains(err.Error(), "The --wpcli-command option cannot be used with the --table or --site-id options.") {
		t.Errorf("err = %v", err)
	}
}

func TestParseLiveCopyCLIOptionsCommaSplit(t *testing.T) {
	opts, err := ParseLiveCopyCLIOptions("", []string{"wp_posts, wp_comments", "wp_users"}, []string{"2,3"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if !opts.UseLiveBackupCopy {
		t.Error("UseLiveBackupCopy must be set")
	}
	if len(opts.Tables) != 3 || opts.Tables[1] != "wp_comments" {
		t.Errorf("tables = %v", opts.Tables)
	}
	if len(opts.SiteIDs) != 2 || opts.SiteIDs[1] != "3" {
		t.Errorf("siteIDs = %v", opts.SiteIDs)
	}
}

func TestParseLiveCopyCLIOptionsEmpty(t *testing.T) {
	opts, err := ParseLiveCopyCLIOptions("", nil, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	if opts.UseLiveBackupCopy {
		t.Error("no options must not enable live copy")
	}
}

// decodePayload reads the JSON document BuildConfig produces — i.e. exactly
// what lands in LiveBackupCopyConfigInput.config on the wire.
func decodePayload(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("payload is not a JSON object: %v (%s)", err, raw)
	}
	return got
}

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "cfg.json")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestBuildConfigFromFlags(t *testing.T) {
	raw, err := BuildConfig(&LiveCopyCLIOptions{UseLiveBackupCopy: true, SiteIDs: []string{"2", "3"}})
	if err != nil {
		t.Fatal(err)
	}
	got := decodePayload(t, raw)
	if got["type"] != "site_ids" {
		t.Errorf("type = %v, want site_ids", got["type"])
	}
	ids, _ := got["site_ids"].([]any)
	if len(ids) != 2 || ids[1] != float64(3) {
		t.Errorf("site_ids = %v", got["site_ids"])
	}
	// Node's getLiveBackupConfigFromCLIOptions leaves the unused fields
	// `undefined`, and JSON.stringify drops them — so the flag path must NOT
	// emit empty tables/wpcli_command keys.
	if _, ok := got["tables"]; ok {
		t.Errorf("flag path emitted a tables key: %v", got)
	}
	if _, ok := got["wpcli_command"]; ok {
		t.Errorf("flag path emitted a wpcli_command key: %v", got)
	}

	raw, err = BuildConfig(&LiveCopyCLIOptions{UseLiveBackupCopy: true, WpcliCommand: "wp post list"})
	if err != nil {
		t.Fatal(err)
	}
	got = decodePayload(t, raw)
	if got["type"] != "wpcli_command" || got["wpcli_command"] != "wp post list" {
		t.Errorf("cfg = %v", got)
	}
}

func TestBuildConfigFromFile(t *testing.T) {
	raw, err := BuildConfig(&LiveCopyCLIOptions{
		UseLiveBackupCopy: true,
		ConfigFile:        writeConfig(t, `{"type":"tables","tables":{"wp_posts":{}}}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	got := decodePayload(t, raw)
	tables, _ := got["tables"].(map[string]any)
	if got["type"] != "tables" || len(tables) != 1 {
		t.Errorf("cfg = %v", got)
	}

	dir := t.TempDir()
	_, err = BuildConfig(&LiveCopyCLIOptions{UseLiveBackupCopy: true, ConfigFile: filepath.Join(dir, "nope.json")})
	if err == nil || !strings.Contains(err.Error(), "Configuration file not found:") {
		t.Errorf("err = %v", err)
	}

	_, err = BuildConfig(&LiveCopyCLIOptions{UseLiveBackupCopy: true, ConfigFile: writeConfig(t, "{nope")})
	if err == nil || !strings.Contains(err.Error(), "Invalid JSON in configuration file:") {
		t.Errorf("err = %v", err)
	}
}

// TestBuildConfigFromFilePreservesUnknownKeys is register 2.18's first
// defect. Node's loadLiveBackupCopyConfig (export-sql.ts:647-662) is a bare
// `JSON.parse( … ) as DBLiveCopyConfig` — a compile-time cast with no runtime
// filtering — and startLiveBackupCopy passes the parsed object straight into
// the GraphQL `config: JSON` scalar. Every key the user wrote reaches the
// server. Go decoded into a typed struct, so keys the struct didn't declare
// (`exclude_tables`, `limit`, per-table `where` clauses) were silently
// dropped: the user got a dump with the WRONG SCOPE and exit 0.
func TestBuildConfigFromFilePreservesUnknownKeys(t *testing.T) {
	raw, err := BuildConfig(&LiveCopyCLIOptions{
		UseLiveBackupCopy: true,
		ConfigFile: writeConfig(t, `{
			"type": "tables",
			"tool": "mysqldump",
			"tables": {"wp_posts": {"where": "ID > 100"}},
			"exclude_tables": ["wp_options", "wp_usermeta"],
			"limit": 500
		}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	got := decodePayload(t, raw)

	excluded, ok := got["exclude_tables"].([]any)
	if !ok || len(excluded) != 2 || excluded[0] != "wp_options" {
		t.Errorf("exclude_tables was dropped: %v", got)
	}
	if got["limit"] != float64(500) {
		t.Errorf("limit was dropped: %v", got)
	}
	tables, _ := got["tables"].(map[string]any)
	wpPosts, _ := tables["wp_posts"].(map[string]any)
	if wpPosts["where"] != "ID > 100" {
		t.Errorf("per-table option was dropped: %v", got)
	}
	if got["tool"] != "mysqldump" {
		t.Errorf("tool was dropped: %v", got)
	}
}

// TestBuildConfigFromFilePreservesEmptyCollections is register 2.18's second
// defect: `omitempty` on the typed struct deleted collections the user wrote
// explicitly. `{"site_ids": []}` is a meaningful (if degenerate) scope; Node
// sends it, Go used to send a config with no site_ids at all — which the
// server reads as a different scope entirely.
func TestBuildConfigFromFilePreservesEmptyCollections(t *testing.T) {
	raw, err := BuildConfig(&LiveCopyCLIOptions{
		UseLiveBackupCopy: true,
		ConfigFile:        writeConfig(t, `{"type":"site_ids","site_ids":[],"tables":{},"wpcli_command":""}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	got := decodePayload(t, raw)
	if _, ok := got["site_ids"]; !ok {
		t.Errorf("empty site_ids was dropped by omitempty: %v", got)
	}
	if _, ok := got["tables"]; !ok {
		t.Errorf("empty tables was dropped by omitempty: %v", got)
	}
	if _, ok := got["wpcli_command"]; !ok {
		t.Errorf("empty wpcli_command was dropped by omitempty: %v", got)
	}
}

// TestBuildConfigFromFileAcceptsBooleanTableOptions is register 2.18's third
// defect. Node's own type says a per-table option value may be a boolean:
//
//	tables?: Record< string, Record< string, string | boolean > >
//
// (live-backup-copy.ts:123). Go's `map[string]map[string]string` made that a
// hard unmarshal failure, so a config file Node accepts aborted the export.
func TestBuildConfigFromFileAcceptsBooleanTableOptions(t *testing.T) {
	raw, err := BuildConfig(&LiveCopyCLIOptions{
		UseLiveBackupCopy: true,
		ConfigFile: writeConfig(t,
			`{"type":"tables","tables":{"wp_posts":{"where":"ID > 1","structure_only":true,"skip_data":false}}}`),
	})
	if err != nil {
		t.Fatalf("boolean per-table option rejected (Node allows string | boolean): %v", err)
	}
	got := decodePayload(t, raw)
	tables, _ := got["tables"].(map[string]any)
	wpPosts, _ := tables["wp_posts"].(map[string]any)
	if wpPosts["structure_only"] != true {
		t.Errorf("structure_only = %v, want true", wpPosts["structure_only"])
	}
	if wpPosts["skip_data"] != false {
		t.Errorf("skip_data = %v, want false", wpPosts["skip_data"])
	}
	if wpPosts["where"] != "ID > 1" {
		t.Errorf("where = %v, want the string", wpPosts["where"])
	}
}

// TestBuildConfigFromFileAllowsDuplicateKeys keeps the jsonv2 port from being
// STRICTER than Node. `JSON.parse` accepts a duplicated object member and
// keeps the last one; jsonv2 rejects duplicates by default, which would turn
// a config file Node runs fine into a hard failure. That would be a new
// divergence introduced by the fix, so it is opted out of explicitly.
func TestBuildConfigFromFileAllowsDuplicateKeys(t *testing.T) {
	raw, err := BuildConfig(&LiveCopyCLIOptions{
		UseLiveBackupCopy: true,
		ConfigFile:        writeConfig(t, `{"type":"tables","type":"site_ids","site_ids":[4]}`),
	})
	if err != nil {
		t.Fatalf("duplicate key rejected; JSON.parse accepts it (last wins): %v", err)
	}
	got := decodePayload(t, raw)
	if got["type"] != "site_ids" {
		t.Errorf("type = %v, want site_ids (JSON.parse keeps the LAST duplicate)", got["type"])
	}
}

// TestSiteIDCommaSplitIsADeliberateKeep pins cutover register item 1.12.
//
// Node's bin declares `--site-id` with `Number.parseInt` as the coercer
// (src/bin/vip-export-sql.js:86-91), so `--site-id=2,3` arrives as the number
// 2 and site 3 is silently dropped — even though Node's own `--site-id=2,3`
// usage example (vip-export-sql.js:44-46) promises both sites. Go splits on
// the comma and exports BOTH, matching the documented behaviour rather than
// the shipped behaviour.
//
// That divergence is a decided KEEP. This test exists so a future agent
// "fixing" it toward Node has to delete an explicit assertion rather than
// quietly regress the scope of a partial export.
func TestSiteIDCommaSplitIsADeliberateKeep(t *testing.T) {
	opts, err := ParseLiveCopyCLIOptions("", nil, []string{"2,3"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(opts.SiteIDs) != 2 || opts.SiteIDs[0] != "2" || opts.SiteIDs[1] != "3" {
		t.Fatalf("SiteIDs = %v, want [2 3] (register 1.12 KEEP; Node's parseInt yields just [2])", opts.SiteIDs)
	}

	raw, err := BuildConfig(opts)
	if err != nil {
		t.Fatal(err)
	}
	got := decodePayload(t, raw)
	ids, _ := got["site_ids"].([]any)
	if len(ids) != 2 || ids[0] != float64(2) || ids[1] != float64(3) {
		t.Errorf("site_ids = %v, want [2 3] on the wire (register 1.12 KEEP)", got["site_ids"])
	}
}

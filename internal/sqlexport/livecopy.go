package sqlexport

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"encoding/json/jsontext"
	json "encoding/json/v2"
)

// LiveCopyCLIOptions ports LiveBackupCopyCLIOptions (live-backup-copy.ts:13).
type LiveCopyCLIOptions struct {
	UseLiveBackupCopy bool
	SiteIDs           []string
	Tables            []string
	WpcliCommand      string
	ConfigFile        string
}

// ParseLiveCopyCLIOptions ports parseLiveBackupCopyCLIOptions
// (live-backup-copy.ts:21): exclusivity rules + comma-split with trim.
func ParseLiveCopyCLIOptions(configFile string, tables, siteIDs []string, wpcliCommand string) (*LiveCopyCLIOptions, error) {
	if configFile != "" && (len(tables) > 0 || len(siteIDs) > 0 || wpcliCommand != "") {
		return nil, errors.New("The --config-file option cannot be used with the --table, --site-id, or --wpcli-command options. Please use only one of these options at a time.")
	}
	if wpcliCommand != "" && (len(tables) > 0 || len(siteIDs) > 0) {
		return nil, errors.New("The --wpcli-command option cannot be used with the --table or --site-id options. Please use only one of these options at a time.")
	}

	opts := &LiveCopyCLIOptions{}
	split := func(values []string) []string {
		var out []string
		for _, v := range values {
			for _, part := range strings.Split(v, ",") {
				out = append(out, strings.TrimSpace(part))
			}
		}
		return out
	}
	if len(tables) > 0 {
		opts.Tables = split(tables)
		opts.UseLiveBackupCopy = true
	}
	if len(siteIDs) > 0 {
		opts.SiteIDs = split(siteIDs)
		opts.UseLiveBackupCopy = true
	}
	if configFile != "" {
		opts.ConfigFile = configFile
		opts.UseLiveBackupCopy = true
	}
	if wpcliCommand != "" {
		opts.WpcliCommand = wpcliCommand
		opts.UseLiveBackupCopy = true
	}
	return opts, nil
}

// LiveCopyConfig ports DBLiveCopyConfig (live-backup-copy.ts:120) for the
// FLAG path only — it is the Go spelling of the object literal Node builds in
// getLiveBackupConfigFromCLIOptions (export-sql.ts:639-644):
//
//	return {
//		type,
//		tables,          // undefined unless --table was passed
//		site_ids: siteIds,
//		wpcli_command: this.liveBackupCopyCLIOptions?.wpcliCommand,
//	};
//
// The `omitempty` tags reproduce JSON.stringify dropping `undefined` fields.
//
// It is deliberately NOT used to parse --config-file. Node's
// loadLiveBackupCopyConfig is `JSON.parse( … ) as DBLiveCopyConfig`: a
// compile-time cast, not a runtime schema. Decoding a user's config file into
// this struct silently discarded every key it doesn't declare and every empty
// collection, changing the scope of the export without any signal. See
// BuildConfig.
type LiveCopyConfig struct {
	Tool string `json:"tool,omitempty"`
	Type string `json:"type"`
	// Values are `string | boolean` in Node (live-backup-copy.ts:123), hence
	// `any` rather than `string`.
	Tables       map[string]map[string]any `json:"tables,omitempty"`
	SiteIDs      []int64                   `json:"site_ids,omitempty"`
	WpcliCommand string                    `json:"wpcli_command,omitempty"`
}

// BuildConfig ports getLiveBackupConfigFromCLIOptions (export-sql.ts:616) +
// loadLiveBackupCopyConfig (export-sql.ts:647). It returns the JSON document
// that becomes LiveBackupCopyConfigInput.config (a `JSON` scalar in the
// schema), so the two paths differ:
//
//   - --config-file: the file's bytes are validated as JSON and passed
//     through VERBATIM, because that is what Node does. `JSON.parse` +
//     an `as` cast keeps every key the user wrote — including ones the CLI
//     has never heard of (`exclude_tables`, `limit`, per-table `where`) —
//     and startLiveBackupCopy hands the whole object to the server. Anything
//     the CLI drops here silently changes which rows the user gets back,
//     with exit 0. Parsing uses encoding/json/v2: a config file is
//     untrusted user input, which is exactly where v1 is finicky.
//
//   - flags: the LiveCopyConfig literal above, marshaled.
func BuildConfig(opts *LiveCopyCLIOptions) ([]byte, error) {
	if opts.ConfigFile != "" {
		if _, err := os.Stat(opts.ConfigFile); err != nil {
			return nil, fmt.Errorf("Configuration file not found: %s", opts.ConfigFile)
		}
		raw, err := os.ReadFile(opts.ConfigFile) // #nosec G304 -- user-supplied CLI path
		if err != nil {
			return nil, fmt.Errorf("Error reading configuration file: %s - %s", opts.ConfigFile, err.Error())
		}
		// Validate only — the decoded shape is not inspected. `any` accepts
		// any JSON document, matching JSON.parse: Node throws only on a
		// SyntaxError, never on an unexpected shape. AllowDuplicateNames
		// keeps us from being STRICTER than JSON.parse, which takes the last
		// of a duplicated member instead of failing.
		var probe any
		if err := json.Unmarshal(raw, &probe, jsontext.AllowDuplicateNames(true)); err != nil {
			return nil, fmt.Errorf("Invalid JSON in configuration file: %s - %s", opts.ConfigFile, err.Error())
		}
		// Re-marshal the *validated* value rather than shipping the file's
		// raw bytes: that normalises whitespace and rejects anything the
		// validator accepted but an embedder would mangle, while preserving
		// every key, every empty collection and every value type.
		return json.Marshal(probe)
	}

	cfg := &LiveCopyConfig{Type: "tables"} // BackupLiveCopyType.TABLES default (export-sql.ts:621)
	if len(opts.Tables) > 0 {
		cfg.Tables = map[string]map[string]any{}
		for _, t := range opts.Tables {
			cfg.Tables[t] = map[string]any{}
		}
	}
	if len(opts.SiteIDs) > 0 {
		cfg.Type = "site_ids"
		for _, id := range opts.SiteIDs {
			var n int64
			_, _ = fmt.Sscanf(strings.TrimSpace(id), "%d", &n)
			cfg.SiteIDs = append(cfg.SiteIDs, n)
		}
	}
	if opts.WpcliCommand != "" {
		cfg.Type = "wpcli_command"
		cfg.WpcliCommand = opts.WpcliCommand
	}
	return json.Marshal(cfg)
}

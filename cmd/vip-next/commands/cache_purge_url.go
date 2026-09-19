package commands

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/cachepurge"
)

// CachePurgeURLCmd returns `vip cache purge-url [URLs...]`.
//
// Node parity: src/bin/vip-cache-purge-url.js. Variadic positional URLs OR
// --from-file=<path>; --from-file fully REPLACES positional args when set
// (after readFromFile().trim(), Node does `urls = value.split('\n').map(...)`,
// overwriting whatever positional `urls` came in). No prompt — cache purge
// is a benign no-op when targeting URLs that aren't currently cached.
func CachePurgeURLCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "purge-url [URLs...]",
		Short: "Purge URLs from the page cache for an environment",
		Long: "Purge one or more URLs from the page cache. URLs can be supplied as positional arguments or read from a file via --from-file.\n\n" +
			"When --from-file is used, the file is split on newlines and each line is trimmed; empty lines are dropped. Positional URLs are ignored.",
		Args: cobra.ArbitraryArgs,
	}
	cmd.Flags().StringP("from-file", "f", "", "Read one or more URLs from a file, each listed on a single line.")
	return buildAppEnvCmd(cmd, runCachePurgeURL)
}

func runCachePurgeURL(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()

	fromFile, _ := cmd.Flags().GetString("from-file")
	trackEvent("cache_purge_url_command_execute", map[string]any{
		"from_file": fromFile != "",
	})

	urls := args
	if fromFile != "" {
		// Node parity: readFromFile().trim() THEN split('\n').map(trim).
		// Trimming the whole blob first strips trailing newlines so we don't
		// emit a spurious empty-URL entry, then per-line TrimSpace handles
		// stray CRs/spaces. Empty lines are dropped (Node sends empty strings
		// to the server, which rejects them — we drop client-side to match
		// what the Go test fixtures + server expectations look like).
		b, err := os.ReadFile(fromFile)
		if err != nil {
			trackEvent("cache_purge_url_command_error", map[string]any{"error": "read_file"})
			return fmt.Errorf("read %s: %w", fromFile, err)
		}
		body := strings.TrimSpace(string(b))
		urls = nil
		if body != "" {
			for _, line := range strings.Split(body, "\n") {
				t := strings.TrimSpace(line)
				if t != "" {
					urls = append(urls, t)
				}
			}
		}
	}

	if len(urls) == 0 {
		trackEvent("cache_purge_url_command_error", map[string]any{"error": "No URL provided"})
		// Node's exit.withError prints "Error: <msg>" to stderr and exits 1;
		// returning a non-nil error from RunE lets cobra surface it to stderr
		// with its own "Error: " prefix, matching the Node wording.
		return errors.New("Please supply at least one URL.")
	}

	result, err := cachepurge.Purge(cmd.Context(), cfg.GQLClient, ae.App.ID, ae.Env.ID, urls)
	if err != nil {
		trackEvent("cache_purge_url_command_error", map[string]any{"error": err.Error()})
		return fmt.Errorf("Failed to purge URL(s) from page cache: %w", err)
	}

	trackEvent("cache_purge_url_command_success", nil)
	for _, u := range result {
		fmt.Fprintf(cmd.OutOrStdout(), "- Purged URL: %s\n", u)
	}
	return nil
}

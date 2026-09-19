package rechallenge

import (
	"log/slog"

	"github.com/pkg/browser"
)

// OpenBrowser tries to open url in the user's default browser. Errors are
// swallowed (logged at debug level) — they're not actionable for the CLI.
// Mirrors src/lib/rechallenge/open-browser.ts.
func OpenBrowser(url string) {
	if err := browser.OpenURL(url); err != nil {
		slog.Debug("rechallenge.OpenBrowser failed", "err", err, "url", url)
	}
}

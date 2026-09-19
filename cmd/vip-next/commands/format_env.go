package commands

import (
	"github.com/Automattic/vip/internal/output"
)

// formatEnvironment mirrors Node's src/lib/cli/format.ts formatEnvironment:
// production -> red("PRODUCTION") (uppercased), everything else -> blueBright
// (lowercased). Used in inline prod-gate prompts so confirm wording matches
// the Node CLI exactly. NO_COLOR is honored automatically by fatih/color.
//
// The implementation lives in internal/output alongside the rest of the
// format.ts port, because appctx's confirmation info table needs it too and
// cannot import this package.
func formatEnvironment(envType string) string {
	return output.FormatEnvironment(envType)
}

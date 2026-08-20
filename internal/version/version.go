// Package version exposes the binary version metadata.
// Values are injected via -ldflags at build time (see Makefile).
package version

import "fmt"

var (
	Version = "dev"
	Commit  = "unknown"
)

func String() string {
	return fmt.Sprintf("vip-next %s (commit %s)", Version, Commit)
}

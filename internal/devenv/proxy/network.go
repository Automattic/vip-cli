package proxy

import (
	"context"

	"github.com/Automattic/vip/internal/devenv/compose"
)

// DockerRunner is the slice of dockercli.Runner this package needs. The
// concrete *dockercli.Runner satisfies it. Docker tees output to the terminal
// and log; DockerOut captures stdout silently for read-only state queries.
type DockerRunner interface {
	Docker(ctx context.Context, args ...string) error
	DockerOut(ctx context.Context, args ...string) ([]byte, error)
}

// EnsureNetwork creates the shared external bridge network if it is absent.
// Ports Lando's bridge-network role onto our single shared network
// (compose.ProxyNetwork). docker network inspect returns non-zero when the
// network does not exist; we then create it. The inspect is a pure existence
// probe, so its stdout (the full network JSON) is captured rather than teed to
// the terminal.
func EnsureNetwork(ctx context.Context, r DockerRunner) error {
	if _, err := r.DockerOut(ctx, "network", "inspect", compose.ProxyNetwork); err == nil {
		return nil
	}
	return r.Docker(ctx, "network", "create", "--driver", "bridge", compose.ProxyNetwork)
}

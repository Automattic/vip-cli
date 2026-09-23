package devenv

import (
	"context"

	"github.com/Automattic/vip/internal/debuglog"
	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/devenv/lifecycle"
)

// EnvStatus is one environment's slug + whether any of its services is running.
type EnvStatus struct {
	Slug    string
	Running bool
}

// anyRunning reports whether any service is in the "running" state.
func anyRunning(states []lifecycle.ServiceState) bool {
	for _, s := range states {
		if s.State == "running" {
			return true
		}
	}
	return false
}

// List returns every on-disk environment with its running state. A docker error
// for a single env degrades to Running=false rather than failing the whole list.
func List(ctx context.Context) ([]EnvStatus, error) {
	r, err := newRunner(ctx)
	if err != nil {
		return nil, err
	}
	d := dockerAdapter{r: r}
	var out []EnvStatus
	names := instancedata.AllNames()
	debuglog.Printf(ctx, debugNamespace, "Will print info for all environments. Names found: %q", names)
	for _, slug := range names {
		states, err := d.ComposePS(ctx, slug)
		running := err == nil && anyRunning(states)
		if err != nil {
			debuglog.Printf(ctx, debugNamespace, "Environment %q status query failed; reporting stopped", slug)
		} else {
			debuglog.Printf(ctx, debugNamespace, "Environment %q: services=%d running=%t", slug, len(states), running)
		}
		out = append(out, EnvStatus{Slug: slug, Running: running})
	}
	return out, nil
}

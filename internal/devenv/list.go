package devenv

import (
	"context"

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
	for _, slug := range instancedata.AllNames() {
		states, err := d.ComposePS(ctx, slug)
		running := err == nil && anyRunning(states)
		out = append(out, EnvStatus{Slug: slug, Running: running})
	}
	return out, nil
}

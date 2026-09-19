package devenv

import (
	"context"

	"github.com/Automattic/vip/internal/devenv/devlog"
)

// LogOptions controls `dev-env logs`. Node passes timestamps:true always.
type LogOptions struct {
	Follow  bool
	Service string // empty = all services
}

// logsArgs builds the compose `logs` args (the project + binary are supplied by
// Runner.Compose). Timestamps are always on, matching Node showLogs.
func logsArgs(o LogOptions) []string {
	args := []string{"logs", "--timestamps"}
	if o.Follow {
		args = append(args, "--follow")
	}
	if o.Service != "" {
		args = append(args, o.Service)
	}
	return args
}

// Logs streams an env's container logs, tee'd through the unified log.
func Logs(ctx context.Context, slug string, o LogOptions) error {
	r, err := newRunner(ctx)
	if err != nil {
		return err
	}
	l, err := devlog.Open(slug)
	if err != nil {
		return err
	}
	defer l.Close()
	r.Log = l
	return r.Compose(ctx, slug, logsArgs(o)...)
}

package dockercli

import (
	"bytes"
	"context"
	"encoding/json"
	"os/exec"
	"strings"

	"github.com/Automattic/vip/internal/devenv/paths"
)

// ServiceState is the subset of `docker compose ps --format json` we consume.
type ServiceState struct {
	Service  string `json:"Service"`
	State    string `json:"State"`
	ExitCode int    `json:"ExitCode"`
}

// parseComposePS handles both NDJSON (one object per line) and a JSON array,
// which different compose versions emit. Blank input yields no services.
func parseComposePS(b []byte) ([]ServiceState, error) {
	t := bytes.TrimSpace(b)
	if len(t) == 0 {
		return nil, nil
	}
	if t[0] == '[' {
		var arr []ServiceState
		if err := json.Unmarshal(t, &arr); err != nil {
			return nil, err
		}
		return arr, nil
	}
	var out []ServiceState
	for _, line := range strings.Split(string(t), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var s ServiceState
		if err := json.Unmarshal([]byte(line), &s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, nil
}

// DockerOut runs `docker <args...>` capturing stdout (no tee). For read-only
// queries like `volume ls`. stderr is discarded; the error carries exit status.
func (r *Runner) DockerOut(ctx context.Context, args ...string) ([]byte, error) {
	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, r.dockerBin(), args...)
	cmd.Stdout = &buf
	err := cmd.Run()
	return buf.Bytes(), err
}

// ComposeOut runs a compose subcommand scoped to a project from the project's
// materialized directory (so compose finds its docker-compose.yml) and returns
// captured stdout. For read-only queries like `ps -q <service>`.
func (r *Runner) ComposeOut(ctx context.Context, project string, args ...string) ([]byte, error) {
	inv := r.composeInv()
	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, inv[0], r.ComposeArgs(project, args...)...)
	cmd.Dir = paths.EnvironmentPath(project)
	cmd.Stdout = &buf
	err := cmd.Run()
	return buf.Bytes(), err
}

// ComposePS returns parsed service states for a project (captured, not tee'd).
// It runs from the project's materialized directory so compose finds its file.
func (r *Runner) ComposePS(ctx context.Context, project string) ([]ServiceState, error) {
	inv := r.composeInv()
	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, inv[0], r.ComposeArgs(project, "ps", "--format", "json", "--all")...)
	cmd.Dir = paths.EnvironmentPath(project)
	cmd.Stdout = &buf
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	return parseComposePS(buf.Bytes())
}

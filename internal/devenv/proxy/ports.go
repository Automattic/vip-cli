// Package proxy manages the shared Traefik reverse proxy (the traefik_openssl
// image), the shared bridge network, fallback-port selection, and the local CA
// + per-environment edge certificates for vip dev environments (spec §5/§8).
// It drives docker through a DockerRunner (the concrete *dockercli.Runner in
// production). Plan 4 lifecycle entry points: Ensure (start/ensure proxy with
// bind-retry fallback ports), RemoveOrphan, Cleanup, EnsureCA, EnsureCert (one
// central leaf cert per env, SANs from compose.CertSANs — the image runs no
// in-service cert machinery, per Task 1 findings), ExtractCA (CA PEM to the host
// for trust), and CAHostPath.
package proxy

import (
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strconv"

	"github.com/Automattic/vip/internal/devenv/paths"
)

// PortsStatePath is where the chosen proxy ports are persisted.
func PortsStatePath() string {
	return filepath.Join(paths.XDGData(), "vip", "dev-env", "proxy-ports.json")
}

// Default ports + fallbacks (parity with lando-proxy/index.js).
const (
	DefaultHTTP      = 80
	DefaultHTTPS     = 443
	ProxyBindAddress = "127.0.0.1"
)

var (
	HTTPFallbacks  = []int{8000, 8080, 8888, 8008}
	HTTPSFallbacks = []int{444, 4433, 4444, 4443}
)

// Ports holds the host ports the proxy is bound to.
type Ports struct {
	HTTP  int `json:"http"`
	HTTPS int `json:"https"`
}

// SelectPort returns the preferred port if free, else the first free fallback.
// free reports whether a port is bindable; production passes a net.Listen probe.
// The caller (proxy.Ensure) re-validates via the actual Docker bind.
func SelectPort(preferred int, fallbacks []int, free func(int) bool) (int, error) {
	if free(preferred) {
		return preferred, nil
	}
	for _, p := range fallbacks {
		if free(p) {
			return p, nil
		}
	}
	return 0, errors.New("proxy: no free port among preferred + fallbacks")
}

// ListenProbe is the production free-port oracle. For privileged ports (<1024)
// it is OPTIMISTIC: a non-root process cannot net.Listen on them, but the
// Docker daemon can bind them, so we defer to the actual Docker bind (and the
// Ensure bind-retry) as the source of truth (spec §8). For >=1024 it does a
// real TCP listen on the proxy bind address.
func ListenProbe(port int) bool {
	if port < 1024 {
		return true
	}
	ln, err := net.Listen("tcp", net.JoinHostPort(ProxyBindAddress, strconv.Itoa(port)))
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}

// SavePorts persists the chosen ports.
func SavePorts(path string, p Ports) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

// LoadPorts reads persisted ports; a missing file yields zero Ports, no error.
func LoadPorts(path string) (Ports, error) {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Ports{}, nil
	}
	if err != nil {
		return Ports{}, err
	}
	var p Ports
	if err := json.Unmarshal(b, &p); err != nil {
		return Ports{}, err
	}
	return p, nil
}

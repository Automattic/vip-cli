package proxy

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Automattic/vip/internal/devenv/paths"
)

//go:embed scripts/gen-certs.sh
var genCertsScript string

// ProxyCertsVolume is the shared named volume that holds the CA and per-env
// leaf certs (mounted at /certs on both the cert-gen one-shot and the proxy).
const ProxyCertsVolume = "vip-dev-env-certs"

// caContainerPath is where the CA PEM lives inside the proxy container.
const caContainerPath = "/certs/lndo.site.pem"

// CertRequest describes a per-environment leaf cert to generate.
type CertRequest struct {
	Basename   string   // base name for cert files (e.g. "example")
	CommonName string   // cert subject CN; defaults to Basename if empty
	SANs       []string // Subject Alternative Names
}

// validCertField rejects characters that would corrupt the openssl subject or
// the space-split SAN list inside gen-certs.sh.
func validCertField(s string) bool {
	return s != "" && !strings.ContainsAny(s, " \t\r\n/")
}

// CAHostPath returns the host-side path where the CA PEM is extracted to.
func CAHostPath() string {
	return filepath.Join(paths.XDGData(), "vip", "dev-env", "proxy", "ca.pem")
}

// EnsureCA runs a one-shot container that idempotently generates the CA
// (lndo.site.pem / lndo.site.key) in the shared certs volume.
func EnsureCA(ctx context.Context, r DockerRunner) error {
	// Intentionally omits proxy_config: no CERT_BASENAME/CERT_SANS are passed,
	// so the script's leaf-cert and Traefik YAML section is skipped entirely.
	return r.Docker(ctx,
		"run", "--rm",
		"-v", ProxyCertsVolume+":/certs",
		ProxyImage,
		"sh", "-c", genCertsScript,
	)
}

// EnsureCert runs a one-shot container that generates a per-environment leaf
// cert (signed by the CA) and writes a Traefik file-provider YAML into the
// proxy_config volume. Returns an error if Basename or SANs are empty.
func EnsureCert(ctx context.Context, r DockerRunner, req CertRequest) error {
	if req.Basename == "" || len(req.SANs) == 0 {
		return errors.New("proxy: EnsureCert requires Basename and SANs")
	}
	if !validCertField(req.Basename) {
		return fmt.Errorf("proxy: invalid cert field %q", req.Basename)
	}
	if req.CommonName != "" && !validCertField(req.CommonName) {
		return fmt.Errorf("proxy: invalid cert field %q", req.CommonName)
	}
	for _, san := range req.SANs {
		if !validCertField(san) {
			return fmt.Errorf("proxy: invalid cert field %q", san)
		}
	}

	args := []string{
		"run", "--rm",
		"-v", ProxyCertsVolume + ":/certs",
		"-v", ProxyConfigVolume + ":/proxy_config",
		"-e", "CERT_BASENAME=" + req.Basename,
	}
	if req.CommonName != "" {
		args = append(args, "-e", "CERT_CN="+req.CommonName)
	}
	args = append(args,
		"-e", "CERT_SANS="+strings.Join(req.SANs, " "),
		ProxyImage,
		"sh", "-c", genCertsScript,
	)

	return r.Docker(ctx, args...)
}

// ExtractCA docker-cp's the CA PEM from the running proxy container to dest
// on the host. It creates dest's parent directory first and returns dest.
func ExtractCA(ctx context.Context, r DockerRunner, dest string) (string, error) {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return "", err
	}
	if err := r.Docker(ctx, "cp", ProxyContainerName+":"+caContainerPath, dest); err != nil {
		return "", err
	}
	return dest, nil
}

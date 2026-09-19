package hostops

import (
	"crypto/sha1" // #nosec G505 -- SHA-1 is the Windows certificate thumbprint format, not a security primitive
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// trustStrat is the CA-trust strategy for the current runtime.
type trustStrat int

const (
	// trustNone: CA trust is unsupported here (native Linux) — skip it.
	trustNone trustStrat = iota
	// trustDarwin: macOS system keychain via `security`.
	trustDarwin
	// trustWindows: Windows Root store via `certutil` (native Windows or WSL).
	trustWindows
)

// trustStrategy picks the trust strategy from the runtime context and GOOS.
// WSL reports GOOS=linux but currentContext()==ctxWindows, so context wins.
func trustStrategy(ctx ctxKind, goos string) trustStrat {
	if ctx == ctxWindows {
		return trustWindows
	}
	if goos == "darwin" {
		return trustDarwin
	}
	return trustNone
}

// CATrusted reports whether caPath's CA is already trusted — a non-privileged
// check so Start can skip the trust elevation (and avoid a re-prompt) when it's
// already trusted. On native Linux, CA trust is unsupported, so it reports true
// ("nothing to do"): Start then writes the hosts block without attempting the
// (impossible) trust. The cert simply isn't browser-trusted on native Linux.
func CATrusted(goos, caPath string) bool {
	if caPath == "" {
		return false
	}
	switch trustStrategy(currentContext(), goos) {
	case trustWindows:
		// certutil addresses a store cert by its thumbprint (SHA-1), NOT by a file
		// path: passing caPath yields CRYPT_E_NOT_FOUND whether or not the CA is
		// trusted, so CATrusted would never see it as trusted and Start would
		// re-elevate on every run. Resolve the thumbprint and verify THAT in Root.
		tp, err := certThumbprint(caPath)
		if err != nil {
			return false // unreadable cert => treat as untrusted; Start will (re)trust
		}
		return exec.Command("certutil", "-verifystore", "Root", tp).Run() == nil
	case trustDarwin:
		return exec.Command("security", "verify-cert", "-c", caPath).Run() == nil
	default: // trustNone (native Linux)
		return true
	}
}

// certThumbprint returns the SHA-1 thumbprint (uppercase hex, no separators) of
// the certificate at caPath — the identifier the Windows cert store / certutil use
// to address a specific cert. caPath is PEM (as ExtractCA writes it); a raw-DER
// fallback keeps it robust.
func certThumbprint(caPath string) (string, error) {
	data, err := os.ReadFile(caPath)
	if err != nil {
		return "", err
	}
	der := data
	if block, _ := pem.Decode(data); block != nil {
		der = block.Bytes
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return "", err
	}
	sum := sha1.Sum(cert.Raw) // #nosec G401 -- SHA-1 is the Windows cert thumbprint algorithm, not used for security
	return strings.ToUpper(hex.EncodeToString(sum[:])), nil
}

// trustCommand returns the argv to add the CA at caPath to the system trust
// store. macOS uses `security add-trusted-cert` against the system keychain
// (requires admin; run under elevation in Task 10). Mirrors Lando's trust step.
func trustCommand(goos, caPath string) ([]string, error) {
	switch goos {
	case "darwin":
		return []string{
			"security", "add-trusted-cert", "-d", "-r", "trustRoot",
			"-k", "/Library/Keychains/System.keychain", caPath,
		}, nil
	case "windows":
		// certutil adds the cert to the LocalMachine Root store (idempotent with -f).
		return []string{"certutil", "-addstore", "-f", "Root", caPath}, nil
	default:
		return nil, fmt.Errorf("hostops: CA trust not supported on %s yet", goos)
	}
}

// untrustCommand returns the argv to remove the CA from the trust store.
// It is the teardown counterpart to trustCommand, consumed by the Plan 4 destroy path.
func untrustCommand(goos, caPath string) ([]string, error) {
	switch goos {
	case "darwin":
		return []string{"security", "remove-trusted-cert", "-d", caPath}, nil
	case "windows":
		return []string{"certutil", "-delstore", "Root", caPath}, nil
	default:
		return nil, fmt.Errorf("hostops: CA untrust not supported on %s yet", goos)
	}
}

// Package keychain wraps the OS credential store.
//
// On macOS, Windows, and Linux+libsecret it uses zalando/go-keyring.
// The file fallback (Task 9) covers headless Linux where Secret Service
// is not available.
//
// vip-next owns a separate credential namespace so its keyring representation
// cannot overwrite credentials used by the Node CLI. The legacy Node service
// name is retained for read-only, best-effort token fallback:
//
//   - vip-next production → "vip-next-cli"
//   - Node production     → "vip-go-cli"
//   - Non-production      → "<base>:<sanitized-url>"
//
// where <sanitized-url> is the full API host URL with every non-alphanumeric
// character replaced by "-", matching:
//
//	API_HOST.replace(/[^a-z0-9]/gi, '-')   (src/lib/token.ts getServiceName)
//
// Callers pass k.Account() — which equals k.Service — as the user argument to
// primary Set/Get/Delete operations. Legacy entries are never written or
// deleted by this package's authentication store.
package keychain

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"

	keyring "github.com/zalando/go-keyring"
)

// ProductionAPIHost is the canonical production endpoint. Both the private
// and legacy namespaces omit a host suffix for this endpoint.
const ProductionAPIHost = "https://api.wpvip.com"

const (
	// service is the Go CLI's private credential namespace.
	service = "vip-next-cli"
	// legacyService is the Node CLI namespace used only for best-effort reads.
	legacyService = "vip-go-cli"
)

// ErrNotFound is returned by Get/Delete when the secret does not exist.
var ErrNotFound = errors.New("keychain: secret not found")

// nonAlphanumeric matches characters that Node replaces with "-".
var nonAlphanumeric = regexp.MustCompile(`[^a-zA-Z0-9]`)

// Backend abstracts the credential store so tests can inject an in-memory
// double and the file fallback can satisfy the same interface.
type Backend interface {
	Set(service, user, secret string) error
	Get(service, user string) (string, error)
	Delete(service, user string) error
}

// Keychain is a scoped handle to a particular credential namespace.
type Keychain struct {
	Backend       Backend
	Service       string
	LegacyService string
}

// New returns a Keychain with private and legacy service names derived from the
// same API host.
//
// It uses the OS keyring where one is available, and falls back to a 0600 file
// store on a headless Linux box where the Secret Service (D-Bus) is not
// reachable so vip-next still works over SSH, in WSL, and in CI.
func New(host string) *Keychain {
	backend := chooseBackend(runtime.GOOS, secretServiceReachable, fallbackDir())
	if fb, ok := backend.(*FileBackend); ok {
		warnFileFallbackOnce(fb.path())
	}
	return &Keychain{
		Backend:       backend,
		Service:       ServiceNameForHost(host),
		LegacyService: LegacyServiceNameForHost(host),
	}
}

// Account returns the private service name used as the default account for
// password operations.
func (k *Keychain) Account() string { return k.Service }

// Set stores secret under the given user account.
func (k *Keychain) Set(user, secret string) error {
	return k.Backend.Set(k.Service, user, secret)
}

// Get retrieves the secret stored under user. Returns ErrNotFound when absent.
func (k *Keychain) Get(user string) (string, error) {
	return k.Backend.Get(k.Service, user)
}

// Delete removes the secret stored under user. Returns ErrNotFound when absent.
func (k *Keychain) Delete(user string) error {
	return k.Backend.Delete(k.Service, user)
}

func serviceNameForHost(base, host string) string {
	// Normalise trailing slash so comparison is robust.
	normalized := strings.TrimRight(host, "/")
	if normalized == ProductionAPIHost {
		return base
	}
	sanitized := nonAlphanumeric.ReplaceAllString(normalized, "-")
	return base + ":" + sanitized
}

// ServiceNameForHost derives vip-next's private service name from an API host.
func ServiceNameForHost(host string) string {
	return serviceNameForHost(service, host)
}

// LegacyServiceNameForHost derives the Node CLI service name used only for
// best-effort token reads.
func LegacyServiceNameForHost(host string) string {
	return serviceNameForHost(legacyService, host)
}

// defaultBackend delegates to zalando/go-keyring (OS credential store).
type defaultBackend struct{}

func (defaultBackend) Set(svc, user, secret string) error {
	return keyring.Set(svc, user, secret)
}

func (defaultBackend) Get(svc, user string) (string, error) {
	v, err := keyring.Get(svc, user)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", ErrNotFound
	}
	return v, err
}

func (defaultBackend) Delete(svc, user string) error {
	err := keyring.Delete(svc, user)
	if errors.Is(err, keyring.ErrNotFound) {
		return ErrNotFound
	}
	return err
}

// secretServiceProbeUser is a sentinel account used only to probe whether the
// Linux Secret Service is reachable; it is never stored.
const secretServiceProbeUser = "__vip_secret_service_probe__"

// chooseBackend picks the OS keyring, or the file fallback on a headless Linux
// box where the Secret Service is unavailable. macOS and Windows always have a
// credential store, so their probe is skipped. Kept pure (probe + dir injected)
// so the selection is unit-testable.
func chooseBackend(goos string, keyringReachable func() bool, fileDir string) Backend {
	if goos != "linux" || keyringReachable() {
		return defaultBackend{}
	}
	return &FileBackend{Dir: fileDir}
}

// secretServiceReachable probes the Linux Secret Service with a cheap Get:
// keyring.ErrNotFound means it is reachable (the probe account is simply
// absent); any other error (e.g. no D-Bus session bus on a headless host)
// means it is unavailable.
func secretServiceReachable() bool {
	_, err := keyring.Get(service, secretServiceProbeUser)
	return err == nil || errors.Is(err, keyring.ErrNotFound)
}

// fallbackDir is where the file backend writes credentials.json when the OS
// keyring is unavailable — the user config dir (…/vip), alongside where the
// Node CLI's configstore fallback lives.
func fallbackDir() string {
	if d, err := os.UserConfigDir(); err == nil && d != "" {
		return filepath.Join(d, "vip")
	}
	if h, err := os.UserHomeDir(); err == nil && h != "" {
		return filepath.Join(h, ".vip")
	}
	return "vip"
}

// fileFallbackWarnOnce guards the single stderr notice below.
var fileFallbackWarnOnce sync.Once

// warnFileFallbackOnce prints one stderr notice that credentials are stored in a
// file rather than the OS keyring (the FileBackend's expected caller warning).
func warnFileFallbackOnce(path string) {
	fileFallbackWarnOnce.Do(func() {
		fmt.Fprintf(os.Stderr, "warning: OS keyring unavailable; storing credentials in %s (0600)\n", path)
	})
}

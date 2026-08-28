package auth

import (
	"errors"
	"log/slog"
	"os"

	"github.com/Automattic/vip/internal/keychain"
)

var ErrNoToken = errors.New("auth: no token stored")

const legacyFallbackDisabledValue = "1"

type Store struct {
	K *keychain.Keychain
	// OnDelete is invoked after a successful Delete (right after the token is
	// purged from keychain). Errors are logged at debug level but never returned,
	// matching Node's logout flow which proceeds even when tokenCache.clearAll
	// throws. Wire this in main.go to rechallenge.TokenCache.ClearAll.
	OnDelete func() error
}

func NewStore(k *keychain.Keychain) *Store { return &Store{K: k} }

func (s *Store) Save(rawJWT string) error {
	if err := s.K.Set(s.K.Account(), rawJWT); err != nil {
		return err
	}
	err := s.K.Backend.Delete(s.K.Service, s.fallbackMarkerAccount())
	if errors.Is(err, keychain.ErrNotFound) {
		return nil
	}
	return err
}

func (s *Store) Load() (string, error) {
	v, err := s.LoadPrimary()
	if err == nil {
		return v, nil
	}
	if !errors.Is(err, ErrNoToken) {
		return "", err
	}
	if s.K.LegacyService == "" {
		return "", ErrNoToken
	}
	if _, markerErr := s.K.Backend.Get(s.K.Service, s.fallbackMarkerAccount()); markerErr == nil {
		return "", ErrNoToken
	} else if !errors.Is(markerErr, keychain.ErrNotFound) {
		return "", markerErr
	}
	v, err = s.K.Backend.Get(s.K.LegacyService, s.K.LegacyService)
	if errors.Is(err, keychain.ErrNotFound) {
		return "", ErrNoToken
	}
	return v, err
}

// tokenOverride returns VIP_TOKEN_OVERRIDE, but only in test mode.
//
// Node gates the same variable on NODE_ENV=test (src/lib/token.ts:105). Go has
// no NODE_ENV, so the gate is GO_ENV=test — the equivalent this repo had already
// settled on before this change: internal/telemetry/tracker.go:83 opts telemetry
// out on GO_ENV=test, and internal/parity/env.go pins GO_ENV alongside NODE_ENV
// for every harness subprocess. NODE_ENV=test is accepted too, so a shell set up
// to drive both CLIs keeps working with one variable.
//
// Honest scope: this is NOT a security boundary. Anyone who can set
// VIP_TOKEN_OVERRIDE in this process's environment can set GO_ENV as well, and
// Node's gate is no stronger. What it does buy is the removal of a much likelier
// non-adversarial failure: a VIP_TOKEN_OVERRIDE left exported in a CI image, a
// shell profile or a .env from an earlier test run silently becoming the
// identity every real command authenticates as — including `logout`, which read
// the override to decide what to revoke but deleted the keychain credential, so
// the two were different tokens.
//
// A gate that an env-var-capable attacker could not defeat would have to be
// compile-time (a build tag, or testing.Testing()). Both were rejected: the
// parity harness drives the SHIPPING binary and needs the hatch, so a
// compile-time gate would mean shipping one binary and testing another.
func tokenOverride() string {
	if os.Getenv("GO_ENV") != "test" && os.Getenv("NODE_ENV") != "test" {
		return ""
	}
	return os.Getenv("VIP_TOKEN_OVERRIDE")
}

// LoadPrimary returns only vip-next's credential (or, in test mode, an explicit
// override). Callers that mutate server-side session state, such as logout, must
// not act on the read-only legacy fallback returned by Load.
func (s *Store) LoadPrimary() (string, error) {
	if override := tokenOverride(); override != "" {
		return override, nil
	}
	v, err := s.K.Get(s.K.Account())
	if errors.Is(err, keychain.ErrNotFound) {
		return "", ErrNoToken
	}
	return v, err
}

func (s *Store) Delete() error {
	err := s.K.Delete(s.K.Account())
	missing := errors.Is(err, keychain.ErrNotFound)
	if err != nil && !missing {
		return err
	}
	if markerErr := s.K.Backend.Set(s.K.Service, s.fallbackMarkerAccount(), legacyFallbackDisabledValue); markerErr != nil {
		return markerErr
	}
	// Run the hook even when the primary token was already gone — elevated
	// tokens may exist independently and need clearing.
	if s.OnDelete != nil {
		if hookErr := s.OnDelete(); hookErr != nil {
			slog.Debug("auth.Store.Delete OnDelete hook failed", "err", hookErr)
		}
		// Hook wired: logout is idempotent (matches Node's logout.ts which
		// proceeds regardless of token state).
		return nil
	}
	if missing {
		return ErrNoToken
	}
	return nil
}

func (s *Store) fallbackMarkerAccount() string {
	return s.K.Service + ":legacy-fallback-disabled"
}

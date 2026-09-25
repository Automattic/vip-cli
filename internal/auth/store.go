package auth

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/Automattic/vip/internal/keychain"
)

var ErrNoToken = errors.New("auth: no token stored")

const legacyFallbackDisabledValue = "1"
const EnvironmentTokenName = "VIP_CLI_TOKEN"

type TokenSource string

const (
	SourceEnvironment TokenSource = "environment"
	SourceStored      TokenSource = "stored"
)

type Credential struct {
	Raw    string
	Source TokenSource
}

func EnvironmentTokenConfigured() bool {
	return strings.TrimSpace(os.Getenv(EnvironmentTokenName)) != ""
}

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

func (s *Store) Resolve() (Credential, error) {
	if raw := strings.TrimSpace(os.Getenv(EnvironmentTokenName)); raw != "" {
		tok, err := ParseToken(raw)
		if err != nil {
			return Credential{}, fmt.Errorf("the token in %s is malformed; replace it with a Personal Access Token from %s, or unset %s to use stored credentials", EnvironmentTokenName, TokenURL, EnvironmentTokenName)
		}
		if !tok.Valid() {
			return Credential{}, fmt.Errorf("the token in %s is expired or invalid; replace it with a Personal Access Token from %s, or unset %s to use stored credentials", EnvironmentTokenName, TokenURL, EnvironmentTokenName)
		}
		return Credential{Raw: tok.Raw, Source: SourceEnvironment}, nil
	}
	raw, err := s.loadStored()
	return Credential{Raw: raw, Source: SourceStored}, err
}

func (s *Store) Load() (string, error) {
	credential, err := s.Resolve()
	return credential.Raw, err
}

func (s *Store) loadStored() (string, error) {
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

// LoadPrimary returns only vip-next's stored credential. Callers that mutate
// server-side session state must not act on Load's read-only legacy fallback.
func (s *Store) LoadPrimary() (string, error) {
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

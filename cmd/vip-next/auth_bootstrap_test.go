package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	json "encoding/json/v2"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
)

type bootstrapBackend struct {
	secrets map[string]string
	getErr  error
}

func (b *bootstrapBackend) Set(service, user, secret string) error {
	if b.secrets == nil {
		b.secrets = make(map[string]string)
	}
	b.secrets[service+"\x00"+user] = secret
	return nil
}

func (b *bootstrapBackend) Get(service, user string) (string, error) {
	if b.getErr != nil {
		return "", b.getErr
	}
	secret, ok := b.secrets[service+"\x00"+user]
	if !ok {
		return "", keychain.ErrNotFound
	}
	return secret, nil
}

func (b *bootstrapBackend) Delete(service, user string) error {
	key := service + "\x00" + user
	if _, ok := b.secrets[key]; !ok {
		return keychain.ErrNotFound
	}
	delete(b.secrets, key)
	return nil
}

func newBootstrapKeychain(backend *bootstrapBackend) *keychain.Keychain {
	return &keychain.Keychain{
		Backend:       backend,
		Service:       "vip-next-bootstrap-test",
		LegacyService: "vip-go-cli-bootstrap-test",
	}
}

func validBootstrapRaw(t *testing.T, id int64) string {
	t.Helper()
	header, err := json.Marshal(map[string]any{"alg": "none", "typ": "JWT"})
	if err != nil {
		t.Fatalf("marshal JWT header: %v", err)
	}
	claims, err := json.Marshal(map[string]any{
		"id":  id,
		"iat": time.Now().Add(-time.Minute).Unix(),
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("marshal JWT claims: %v", err)
	}
	enc := base64.RawURLEncoding
	return enc.EncodeToString(header) + "." + enc.EncodeToString(claims) + "."
}

func parsedBootstrapToken(t *testing.T, raw string) *auth.Token {
	t.Helper()
	tok, err := auth.ParseToken(raw)
	if err != nil {
		t.Fatalf("parse token: %v", err)
	}
	return tok
}

func TestWithAuthenticatedSessionUsesValidStoredToken(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	backend := &bootstrapBackend{}
	k := newBootstrapKeychain(backend)
	store := auth.NewStore(k)
	raw := validBootstrapRaw(t, 10000)
	if err := store.Save(raw); err != nil {
		t.Fatalf("save token: %v", err)
	}
	loginCalls := 0
	nextCalls := 0

	err := withAuthenticatedSession(true, authBootstrapDeps{
		Keychain: k,
		Store:    store,
		Login: func() (*auth.Token, error) {
			loginCalls++
			return nil, errors.New("login should not run")
		},
	}, func(session *authSession) error {
		nextCalls++
		if session.Raw != raw || session.Keychain != k || session.Store != store {
			t.Fatalf("session = %#v, want stored-token dependencies", session)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("withAuthenticatedSession: %v", err)
	}
	if loginCalls != 0 || nextCalls != 1 {
		t.Fatalf("login calls = %d, continuation calls = %d; want 0, 1", loginCalls, nextCalls)
	}
}

func TestWithAuthenticatedSessionUsesLegacyTokenWhenPrimaryMissing(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	backend := &bootstrapBackend{}
	k := newBootstrapKeychain(backend)
	raw := validBootstrapRaw(t, 10000)
	if err := backend.Set(k.LegacyService, k.LegacyService, raw); err != nil {
		t.Fatalf("seed legacy token: %v", err)
	}
	loginCalls := 0

	err := withAuthenticatedSession(true, authBootstrapDeps{
		Keychain: k,
		Store:    auth.NewStore(k),
		Login: func() (*auth.Token, error) {
			loginCalls++
			return nil, errors.New("login should not run")
		},
	}, func(session *authSession) error {
		if session.Raw != raw {
			t.Fatalf("session token = %q, want legacy token", session.Raw)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("withAuthenticatedSession: %v", err)
	}
	if loginCalls != 0 {
		t.Fatalf("login calls = %d, want 0", loginCalls)
	}
}

func TestWithAuthenticatedSessionLogsInWhenMissingAndResumes(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	backend := &bootstrapBackend{}
	k := newBootstrapKeychain(backend)
	store := auth.NewStore(k)
	freshRaw := validBootstrapRaw(t, 10000)
	loginCalls := 0
	nextCalls := 0

	err := withAuthenticatedSession(true, authBootstrapDeps{
		Keychain: k,
		Store:    store,
		Login: func() (*auth.Token, error) {
			loginCalls++
			return parsedBootstrapToken(t, freshRaw), nil
		},
	}, func(session *authSession) error {
		nextCalls++
		if session.Raw != freshRaw {
			t.Fatalf("continuation token = %q, want freshly returned token", session.Raw)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("withAuthenticatedSession: %v", err)
	}
	if loginCalls != 1 || nextCalls != 1 {
		t.Fatalf("login calls = %d, continuation calls = %d; want 1, 1", loginCalls, nextCalls)
	}
}

func TestWithAuthenticatedSessionRefreshesInvalidTokenAndResumes(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	backend := &bootstrapBackend{}
	k := newBootstrapKeychain(backend)
	store := auth.NewStore(k)
	if err := store.Save("invalid-stored-token"); err != nil {
		t.Fatalf("save invalid token: %v", err)
	}
	freshRaw := validBootstrapRaw(t, 10000)
	loginCalls := 0
	nextCalls := 0

	err := withAuthenticatedSession(true, authBootstrapDeps{
		Keychain: k,
		Store:    store,
		Login: func() (*auth.Token, error) {
			loginCalls++
			return parsedBootstrapToken(t, freshRaw), nil
		},
	}, func(session *authSession) error {
		nextCalls++
		if session.Raw != freshRaw {
			t.Fatalf("continuation token = %q, want freshly returned token", session.Raw)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("withAuthenticatedSession: %v", err)
	}
	if loginCalls != 1 || nextCalls != 1 {
		t.Fatalf("login calls = %d, continuation calls = %d; want 1, 1", loginCalls, nextCalls)
	}
}

func TestWithAuthenticatedSessionStopsCleanlyOnCancel(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	k := newBootstrapKeychain(&bootstrapBackend{})
	nextCalls := 0
	err := withAuthenticatedSession(true, authBootstrapDeps{
		Keychain: k,
		Store:    auth.NewStore(k),
		Login:    func() (*auth.Token, error) { return nil, auth.ErrLoginCancelled },
	}, func(*authSession) error {
		nextCalls++
		return nil
	})
	if err != nil {
		t.Fatalf("withAuthenticatedSession: %v", err)
	}
	if nextCalls != 0 {
		t.Fatalf("continuation calls = %d, want 0", nextCalls)
	}
}

func TestWithAuthenticatedSessionStopsCleanlyOnHandledValidationError(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	k := newBootstrapKeychain(&bootstrapBackend{})
	nextCalls := 0
	err := withAuthenticatedSession(true, authBootstrapDeps{
		Keychain: k,
		Store:    auth.NewStore(k),
		Login:    func() (*auth.Token, error) { return nil, fmt.Errorf("wrapped: %w", auth.ErrTokenInvalid) },
	}, func(*authSession) error {
		nextCalls++
		return nil
	})
	if err != nil {
		t.Fatalf("withAuthenticatedSession: %v", err)
	}
	if nextCalls != 0 {
		t.Fatalf("continuation calls = %d, want 0", nextCalls)
	}
}

func TestWithAuthenticatedSessionSurfacesUnexpectedLoginError(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	k := newBootstrapKeychain(&bootstrapBackend{})
	want := errors.New("browser exploded")
	nextCalls := 0
	err := withAuthenticatedSession(true, authBootstrapDeps{
		Keychain: k,
		Store:    auth.NewStore(k),
		Login:    func() (*auth.Token, error) { return nil, want },
	}, func(*authSession) error {
		nextCalls++
		return nil
	})
	if !errors.Is(err, want) {
		t.Fatalf("error = %v, want %v", err, want)
	}
	if nextCalls != 0 {
		t.Fatalf("continuation calls = %d, want 0", nextCalls)
	}
}

func TestWithAuthenticatedSessionNonInteractiveMissingFailsWithoutLogin(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	k := newBootstrapKeychain(&bootstrapBackend{})
	loginCalls := 0
	nextCalls := 0
	err := withAuthenticatedSession(false, authBootstrapDeps{
		Keychain: k,
		Store:    auth.NewStore(k),
		Login: func() (*auth.Token, error) {
			loginCalls++
			return nil, nil
		},
	}, func(*authSession) error {
		nextCalls++
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "not logged in") {
		t.Fatalf("error = %v, want not-logged-in error", err)
	}
	if loginCalls != 0 || nextCalls != 0 {
		t.Fatalf("login calls = %d, continuation calls = %d; want 0, 0", loginCalls, nextCalls)
	}
}

func TestWithAuthenticatedSessionNonInteractiveInvalidFailsWithoutLogin(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	backend := &bootstrapBackend{}
	k := newBootstrapKeychain(backend)
	store := auth.NewStore(k)
	if err := store.Save("invalid-stored-token"); err != nil {
		t.Fatalf("save invalid token: %v", err)
	}
	loginCalls := 0
	nextCalls := 0
	err := withAuthenticatedSession(false, authBootstrapDeps{
		Keychain: k,
		Store:    store,
		Login: func() (*auth.Token, error) {
			loginCalls++
			return nil, nil
		},
	}, func(*authSession) error {
		nextCalls++
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "invalid or expired") {
		t.Fatalf("error = %v, want invalid-token error", err)
	}
	if loginCalls != 0 || nextCalls != 0 {
		t.Fatalf("login calls = %d, continuation calls = %d; want 0, 0", loginCalls, nextCalls)
	}
}

func TestWithAuthenticatedSessionSurfacesKeychainLoadError(t *testing.T) {
	t.Setenv("VIP_TOKEN_OVERRIDE", "")
	want := errors.New("keychain unavailable")
	k := newBootstrapKeychain(&bootstrapBackend{getErr: want})
	loginCalls := 0
	nextCalls := 0
	err := withAuthenticatedSession(true, authBootstrapDeps{
		Keychain: k,
		Store:    auth.NewStore(k),
		Login: func() (*auth.Token, error) {
			loginCalls++
			return nil, nil
		},
	}, func(*authSession) error {
		nextCalls++
		return nil
	})
	if !errors.Is(err, want) {
		t.Fatalf("error = %v, want %v", err, want)
	}
	if loginCalls != 0 || nextCalls != 0 {
		t.Fatalf("login calls = %d, continuation calls = %d; want 0, 0", loginCalls, nextCalls)
	}
}

func TestIsNonInteractiveArgvBoundaries(t *testing.T) {
	tests := []struct {
		argv []string
		want bool
	}{
		{[]string{"--non-interactive", "app", "list"}, true},
		{[]string{"app", "list", "--non-interactive"}, true},
		{[]string{"--non-interactive=true", "whoami"}, true},
		{[]string{"--non-interactive=false", "whoami"}, false},
		{[]string{"--", "--non-interactive"}, false},
		{[]string{"wp", "option", "get", "home", "--non-interactive"}, false},
		{[]string{"@app.env", "wp", "--non-interactive"}, false},
		{[]string{"--non-interactive", "@app.env", "wp", "option", "get", "home"}, true},
		{[]string{"--app", "wp", "app", "list", "--non-interactive"}, true},
		{[]string{"app", "list", "--env", "wp", "--non-interactive"}, true},
		{[]string{"app", "list", "--non-interactive=false", "--non-interactive"}, true},
		{[]string{"--non-interactive=invalid", "whoami"}, true},
	}
	for _, tt := range tests {
		t.Run(strings.Join(tt.argv, " "), func(t *testing.T) {
			if got := isNonInteractiveArgv(tt.argv); got != tt.want {
				t.Fatalf("isNonInteractiveArgv(%q) = %v, want %v", tt.argv, got, tt.want)
			}
		})
	}
}

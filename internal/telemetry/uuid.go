// Package telemetry handles analytics (Tracks + Pendo) for the Go binary.
// Anonymous UUIDs use vip-next's private keychain namespace so writes cannot
// alter the Node CLI's telemetry identity.
package telemetry

import (
	"crypto/rand"
	"encoding/hex"
	"errors"

	"github.com/Automattic/vip/internal/keychain"
)

type UUIDStore struct {
	Keychain *keychain.Keychain
}

func (s *UUIDStore) serviceName() string { return s.Keychain.Service + "-uuid" }

func (s *UUIDStore) Get() (string, error) {
	svc := s.serviceName()
	v, err := s.Keychain.Backend.Get(svc, svc)
	if err == nil {
		return v, nil
	}
	if !errors.Is(err, keychain.ErrNotFound) {
		return "", err
	}
	id, err := newRandomUUID()
	if err != nil {
		return "", err
	}
	if err := s.Keychain.Backend.Set(svc, svc, id); err != nil {
		return "", err
	}
	return id, nil
}

func (s *UUIDStore) Set(id string) error {
	svc := s.serviceName()
	return s.Keychain.Backend.Set(svc, svc, id)
}

func newRandomUUID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

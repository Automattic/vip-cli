package keychain

import (
	json "encoding/json/v2"
	"os"
	"path/filepath"
	"sync"
)

// FileBackend stores credentials in $Dir/credentials.json with mode 0600.
// Used on hosts without an OS credential store (headless Linux without
// libsecret, some CI). Emits a one-time warning on first use via the
// caller.
type FileBackend struct {
	Dir string
	mu  sync.Mutex
}

type fileStore struct {
	Entries map[string]string `json:"entries"`
}

func (b *FileBackend) path() string { return filepath.Join(b.Dir, "credentials.json") }

func key(service, user string) string { return service + "|" + user }

func (b *FileBackend) load() (*fileStore, error) {
	data, err := os.ReadFile(b.path())
	if os.IsNotExist(err) {
		return &fileStore{Entries: map[string]string{}}, nil
	}
	if err != nil {
		return nil, err
	}
	s := &fileStore{}
	if err := json.Unmarshal(data, s); err != nil {
		return nil, err
	}
	if s.Entries == nil {
		s.Entries = map[string]string{}
	}
	return s, nil
}

func (b *FileBackend) save(s *fileStore) error {
	if err := os.MkdirAll(b.Dir, 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(s, json.Deterministic(true))
	if err != nil {
		return err
	}
	return os.WriteFile(b.path(), data, 0o600)
}

func (b *FileBackend) Set(service, user, secret string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	s, err := b.load()
	if err != nil {
		return err
	}
	s.Entries[key(service, user)] = secret
	return b.save(s)
}

func (b *FileBackend) Get(service, user string) (string, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	s, err := b.load()
	if err != nil {
		return "", err
	}
	v, ok := s.Entries[key(service, user)]
	if !ok {
		return "", ErrNotFound
	}
	return v, nil
}

func (b *FileBackend) Delete(service, user string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	s, err := b.load()
	if err != nil {
		return err
	}
	if _, ok := s.Entries[key(service, user)]; !ok {
		return ErrNotFound
	}
	delete(s.Entries, key(service, user))
	return b.save(s)
}

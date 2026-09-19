package rechallenge

import (
	"errors"
	"regexp"
	"sync"
	"time"

	json "encoding/json/v2"

	"github.com/Automattic/vip/internal/keychain"
)

// baseServiceName keeps vip-next's elevated tokens isolated from the Node CLI.
const baseServiceName = "vip-next-cli:elevated"

// nonAlphanumericTC matches the sanitization used by Node's
// API_HOST.replace(/[^a-z0-9]/gi, '-') so production and non-prod hosts get
// distinct service entries.
var nonAlphanumericTC = regexp.MustCompile(`[^a-zA-Z0-9]`)

// ServiceNameForHost builds the keychain service name for the elevated-token
// cache. Returns the bare base name for the production API host; otherwise
// suffixes ":<sanitized-host>".
func ServiceNameForHost(apiHost string) string {
	if apiHost == keychain.ProductionAPIHost {
		return baseServiceName
	}
	return baseServiceName + ":" + nonAlphanumericTC.ReplaceAllString(apiHost, "-")
}

// TokenCache stores elevated tokens per scope in a single Go-owned keychain
// entry. The on-disk shape is a JSON blob {scope: ElevatedToken}, keeping
// ClearAll cheap while preserving the Node data shape.
type TokenCache struct {
	Keychain *keychain.Keychain
	mu       sync.Mutex
	loaded   bool
	blob     map[string]ElevatedToken
}

func (c *TokenCache) load() error {
	if c.loaded {
		return nil
	}
	raw, err := c.Keychain.Backend.Get(c.Keychain.Service, c.Keychain.Service)
	if errors.Is(err, keychain.ErrNotFound) {
		c.blob = map[string]ElevatedToken{}
		c.loaded = true
		return nil
	}
	if err != nil {
		return err
	}
	parsed := map[string]ElevatedToken{}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		// Corrupted blob → drop and reset (matches Node).
		_ = c.Keychain.Backend.Delete(c.Keychain.Service, c.Keychain.Service)
		c.blob = map[string]ElevatedToken{}
		c.loaded = true
		return nil
	}
	c.blob = parsed
	c.loaded = true
	return nil
}

func (c *TokenCache) write() error {
	if len(c.blob) == 0 {
		err := c.Keychain.Backend.Delete(c.Keychain.Service, c.Keychain.Service)
		if errors.Is(err, keychain.ErrNotFound) {
			return nil
		}
		return err
	}
	data, err := json.Marshal(c.blob, json.Deterministic(true))
	if err != nil {
		return err
	}
	return c.Keychain.Backend.Set(c.Keychain.Service, c.Keychain.Service, string(data))
}

// Get returns the cached token for scope, or nil if missing/expired.
// Expired tokens are evicted as a side effect (matches Node).
func (c *TokenCache) Get(scope string) (*ElevatedToken, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.load(); err != nil {
		return nil, err
	}
	tok, ok := c.blob[scope]
	if !ok {
		return nil, nil
	}
	if isExpired(tok) {
		delete(c.blob, scope)
		if err := c.write(); err != nil {
			return nil, err
		}
		return nil, nil
	}
	return &tok, nil
}

func (c *TokenCache) Set(scope string, tok ElevatedToken) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.load(); err != nil {
		return err
	}
	c.blob[scope] = tok
	return c.write()
}

func (c *TokenCache) ClearScope(scope string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.load(); err != nil {
		return err
	}
	if _, ok := c.blob[scope]; !ok {
		return nil
	}
	delete(c.blob, scope)
	return c.write()
}

// ClearAll drops the keychain entry entirely. Called on logout.
func (c *TokenCache) ClearAll() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.blob = map[string]ElevatedToken{}
	c.loaded = true
	err := c.Keychain.Backend.Delete(c.Keychain.Service, c.Keychain.Service)
	if errors.Is(err, keychain.ErrNotFound) {
		return nil
	}
	return err
}

// isExpired matches Node's 5-second grace window. A token whose ExpiresAt is
// within the next 5 seconds counts as expired.
func isExpired(tok ElevatedToken) bool {
	if tok.ExpiresAt.IsZero() {
		return true
	}
	return time.Now().Add(5 * time.Second).After(tok.ExpiresAt)
}

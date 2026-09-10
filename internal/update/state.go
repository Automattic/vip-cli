package update

import (
	json "encoding/json/v2"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type Cache struct {
	Schema                      int
	Platform                    Platform
	Channel                     Channel
	LastCheckedAt, LastFailedAt time.Time
	Releases                    []Release
}
type State struct{ CacheDir, ConfigDir string }

func (s State) cachePath(ch Channel, p Platform) (string, error) {
	if ch != Stable && ch != Preview {
		return "", fmt.Errorf("invalid channel")
	}
	if _, err := p.archiveName(); err != nil {
		return "", err
	}
	return filepath.Join(s.CacheDir, p.OS+"-"+p.Arch+"-"+string(ch)+".json"), nil
}
func (s State) ReadCache(ch Channel, p Platform) (Cache, error) {
	var c Cache
	name, err := s.cachePath(ch, p)
	if err != nil {
		return c, err
	}
	err = readJSON(name, 8<<20, &c)
	if err != nil {
		return c, err
	}
	if c.Schema != 1 || c.Channel != ch || c.Platform != p {
		return Cache{}, fmt.Errorf("invalid update cache")
	}
	return c, nil
}
func (s State) WriteCache(c Cache) error {
	name, err := s.cachePath(c.Channel, c.Platform)
	if err != nil {
		return err
	}
	return writeJSON(name, c)
}
func (s State) ReadChannel() (Channel, error) {
	var pref struct{ Channel Channel }
	err := readJSON(filepath.Join(s.ConfigDir, "update.json"), 4096, &pref)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("read update preference (use --channel to repair): %w", err)
	}
	if pref.Channel != Stable && pref.Channel != Preview {
		return "", fmt.Errorf("invalid update preference; use --channel stable or preview to repair")
	}
	return pref.Channel, nil
}
func (s State) WriteChannel(ch Channel) error {
	if ch != Stable && ch != Preview {
		return fmt.Errorf("invalid channel")
	}
	return writeJSON(filepath.Join(s.ConfigDir, "update.json"), struct{ Channel Channel }{ch})
}
func Due(c Cache, now time.Time) bool {
	if c.Schema != 1 {
		return true
	}
	if c.LastCheckedAt.After(now) || c.LastFailedAt.After(now) {
		return true
	}
	if !c.LastFailedAt.IsZero() && now.Sub(c.LastFailedAt) < time.Hour {
		return false
	}
	return c.LastCheckedAt.IsZero() || now.Sub(c.LastCheckedAt) >= 24*time.Hour
}
func readJSON(name string, max int64, v any) error {
	f, err := os.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	b, err := readBounded(f, max)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}
func writeJSON(name string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(name), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(name), ".update-state-")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), name)
}

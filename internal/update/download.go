package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/httpproxy"
)

type Downloader struct{ Client *http.Client }

func (d Downloader) Stage(ctx context.Context, c Candidate, p Platform, parent string) (bundle Bundle, err error) {
	name, err := p.archiveName()
	if err != nil {
		return bundle, err
	}
	if !validVersion(c.Version) || c.Archive.Name != name || c.Checksum.Name != name+".sha256" {
		return bundle, fmt.Errorf("invalid release assets")
	}
	for _, a := range []Asset{c.Archive, c.Checksum} {
		u, e := url.Parse(a.URL)
		if e != nil || u.Scheme != "https" || u.Host != "github.com" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/"+Repository+"/releases/download/"+c.Version+"/"+a.Name {
			return bundle, fmt.Errorf("invalid official release asset URL")
		}
	}
	dir, err := os.MkdirTemp(parent, ".vip-update-stage-")
	if err != nil {
		return bundle, err
	}
	defer func() {
		if err != nil {
			os.RemoveAll(dir)
		}
	}()
	checksum, err := d.fetch(ctx, c.Checksum, 4096)
	if err != nil {
		return bundle, err
	}
	line := strings.TrimSpace(string(checksum))
	if strings.ContainsAny(line, "\r\n") {
		return bundle, fmt.Errorf("checksum file must contain one non-empty line")
	}
	fields := strings.Fields(line)
	if len(fields) != 2 || strings.TrimPrefix(strings.TrimPrefix(fields[1], "*"), "dist/") != name {
		return bundle, fmt.Errorf("invalid release checksum file")
	}
	want, err := hex.DecodeString(fields[0])
	if err != nil || len(want) != sha256.Size {
		return bundle, fmt.Errorf("invalid SHA-256 checksum")
	}
	archive, err := d.fetch(ctx, c.Archive, maxArchive)
	if err != nil {
		return bundle, err
	}
	sum := sha256.Sum256(archive)
	if !strings.EqualFold(hex.EncodeToString(sum[:]), fields[0]) {
		return bundle, fmt.Errorf("release checksum mismatch")
	}
	archivePath := filepath.Join(dir, "release.tar.gz")
	if err = os.WriteFile(archivePath, archive, 0600); err != nil {
		return bundle, err
	}
	bundle, err = Extract(archivePath, dir, p)
	return bundle, err
}
func (d Downloader) fetch(ctx context.Context, a Asset, limit int64) ([]byte, error) {
	if a.Size < 0 || a.Size > limit {
		return nil, fmt.Errorf("release asset exceeds size limit")
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	client := d.Client
	if client == nil {
		client = httpproxy.Client()
	}
	copyClient := *client
	copyClient.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) > 5 || req.URL.Scheme != "https" || req.URL.User != nil {
			return fmt.Errorf("invalid release redirect")
		}
		req.Header.Del("Authorization")
		req.Header.Del("Cookie")
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.URL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "vip-next-updater")
	resp, err := copyClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		// Client.Do wraps transport failures with a URL that may contain a
		// signed CDN query. Retain the cause without that URL wrapper.
		for {
			urlErr, ok := err.(*url.Error)
			if !ok {
				break
			}
			err = urlErr.Err
		}
		return nil, fmt.Errorf("download %s failed: %w", a.Name, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("download %s: HTTP %d", a.Name, resp.StatusCode)
	}
	if resp.ContentLength > limit {
		return nil, fmt.Errorf("release asset exceeds size limit")
	}
	b, err := readBounded(resp.Body, limit)
	if err != nil {
		return nil, err
	}
	if a.Size > 0 && int64(len(b)) != a.Size {
		return nil, fmt.Errorf("release asset size mismatch")
	}
	if a.Digest != "" {
		if !strings.HasPrefix(a.Digest, "sha256:") {
			return nil, fmt.Errorf("unsupported release asset digest")
		}
		sum := sha256.Sum256(b)
		if !strings.EqualFold(a.Digest, "sha256:"+hex.EncodeToString(sum[:])) {
			return nil, fmt.Errorf("release asset digest mismatch")
		}
	}
	return b, nil
}

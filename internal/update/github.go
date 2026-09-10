package update

import (
	"context"
	json "encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Automattic/vip/internal/httpproxy"
)

type GitHub struct {
	Client  *http.Client
	BaseURL string
}

func (g GitHub) Releases(ctx context.Context) ([]Release, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	base := g.BaseURL
	if base == "" {
		base = "https://api.github.com"
	}
	origin, err := url.Parse(base)
	if err != nil {
		return nil, err
	}
	endpoint := strings.TrimRight(base, "/") + "/repos/" + Repository + "/releases"
	client := g.Client
	if client == nil {
		client = httpproxy.Client()
	}
	// API pagination must never redirect to another source or forward credentials.
	copyClient := *client
	copyClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	var releases []Release
	for page := 1; page <= 100; {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?per_page=100&page="+strconv.Itoa(page), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "vip-next-updater")
		req.Header.Set("Accept", "application/vnd.github+json")
		resp, err := copyClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("check GitHub releases: %w", err)
		}
		body, readErr := readBounded(resp.Body, 2<<20)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("check GitHub releases: HTTP %d", resp.StatusCode)
		}
		if readErr != nil {
			return nil, readErr
		}
		var batch []Release
		if err := json.Unmarshal(body, &batch); err != nil {
			return nil, fmt.Errorf("invalid GitHub release metadata: %w", err)
		}
		releases = append(releases, batch...)
		next := 0
		for _, part := range strings.Split(resp.Header.Get("Link"), ",") {
			if !strings.Contains(part, `rel="next"`) {
				continue
			}
			left, right := strings.Index(part, "<"), strings.Index(part, ">")
			if left < 0 || right <= left {
				return nil, fmt.Errorf("invalid release pagination")
			}
			u, err := url.Parse(part[left+1 : right])
			if err != nil {
				return nil, fmt.Errorf("invalid release pagination")
			}
			u = origin.ResolveReference(u)
			n, err := strconv.Atoi(u.Query().Get("page"))
			if err != nil || n <= page || u.Scheme != origin.Scheme || u.Host != origin.Host || u.Path != "/repos/"+Repository+"/releases" || u.User != nil || next != 0 {
				return nil, fmt.Errorf("invalid release pagination")
			}
			next = n
		}
		if next == 0 {
			return releases, nil
		}
		page = next
	}
	return nil, fmt.Errorf("GitHub release pagination limit exceeded")
}
func readBounded(r io.Reader, max int64) ([]byte, error) {
	b, err := io.ReadAll(io.LimitReader(r, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > max {
		return nil, fmt.Errorf("response exceeds size limit")
	}
	return b, nil
}

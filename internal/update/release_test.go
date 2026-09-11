package update

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func release(tag string) Release {
	return Release{Tag: tag, Prerelease: strings.Contains(tag, "-"), Assets: []Asset{{Name: "vip-next-linux-amd64.tar.gz"}, {Name: "vip-next-linux-amd64.tar.gz.sha256"}}}
}
func TestChannelsAndSelection(t *testing.T) {
	for _, tc := range []struct {
		installed      string
		explicit, want Channel
	}{
		{"5.0.0-alpha.3", "", Preview}, {"5.0.0", "", Stable}, {"5.0.0", Preview, Preview}, {"5.0.0-rc.2", Stable, Stable},
	} {
		got, err := EffectiveChannel(tc.installed, tc.explicit)
		if err != nil || got != tc.want {
			t.Fatalf("%+v: %s %v", tc, got, err)
		}
	}
	for _, v := range []string{"dev", "5.0.0-dev.deadbee", "5.0.0-alpha.01", "4.9.0", "5.0.0-abc.1"} {
		if _, err := EffectiveChannel(v, ""); err == nil {
			t.Errorf("accepted %s", v)
		}
	}
	for _, tc := range []struct {
		installed string
		channel   Channel
		tags      []string
		want      string
	}{
		{"5.0.0-alpha.3", Preview, []string{"5.0.0-alpha.9", "5.0.0-alpha.10"}, "5.0.0-alpha.10"},
		{"5.0.0", Stable, []string{"4.9.0", "6.0.0", "5.1.0-beta.1", "5.0.1"}, "5.0.1"},
		{"5.0.0-rc.2", Stable, []string{"4.9.0", "5.0.0-beta.1"}, ""},
		{"5.0.0-rc.2", Preview, []string{"5.0.0", "5.0.0-alpha.9"}, "5.0.0"},
		{"5.0.0", Preview, []string{"5.0.0", "5.1.0-alpha.1"}, "5.1.0-alpha.1"},
	} {
		var rs []Release
		for _, v := range tc.tags {
			rs = append(rs, release(v))
		}
		got, err := Select(tc.installed, tc.channel, Platform{"linux", "amd64"}, rs)
		if err != nil {
			t.Fatal(err)
		}
		v := ""
		if got != nil {
			v = got.Version
		}
		if v != tc.want {
			t.Errorf("%+v got %s", tc, v)
		}
	}
}
func TestSelectRejectsIncompleteAndInconsistentReleases(t *testing.T) {
	p := Platform{"linux", "amd64"}
	r := release("5.0.1")
	r.Draft = true
	got, err := Select("5.0.0", Stable, p, []Release{r})
	if err != nil || got != nil {
		t.Fatal(got, err)
	}
	r.Draft = false
	r.Assets = r.Assets[:1]
	got, err = Select("5.0.0", Stable, p, []Release{r})
	if err != nil || got != nil {
		t.Fatal(got, err)
	}
	r = release("5.0.1")
	r.Assets = append(r.Assets, r.Assets[0])
	if _, err = Select("5.0.0", Stable, p, []Release{r}); err == nil {
		t.Fatal("duplicate accepted")
	}
	r = release("5.0.1")
	r.Prerelease = true
	if _, err = Select("5.0.0", Stable, p, []Release{r}); err == nil {
		t.Fatal("inconsistent accepted")
	}
	if _, err = Select("5.0.0", Stable, Platform{"windows", "arm64"}, nil); err == nil {
		t.Fatal("unsupported platform")
	}
}
func TestGitHubPagination(t *testing.T) {
	for _, tc := range []struct {
		name, nextPath string
	}{{"named repository", "/repos/Automattic/vip-cli/releases"}, {"numeric repository ID", "/repositories/116313791/releases"}} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.Header.Get("Authorization") != "" {
					t.Error("credentials")
				}
				if r.URL.Path != "/repos/Automattic/vip-cli/releases" {
					t.Error(r.URL.Path)
				}
				if r.URL.Query().Get("page") == "1" {
					w.Header().Set("Link", "<http://"+r.Host+tc.nextPath+"?per_page=100&page=2>; rel=\"next\"")
					fmt.Fprint(w, `[{"tag_name":"4.9.0"}]`)
				} else {
					fmt.Fprint(w, `[{"tag_name":"5.0.0"}]`)
				}
			}))
			defer s.Close()
			rs, err := (GitHub{Client: s.Client(), BaseURL: s.URL}).Releases(context.Background())
			if err != nil || len(rs) != 2 || calls != 2 {
				t.Fatal(rs, err, calls)
			}
		})
	}
}

func TestGitHubRejectsDuplicateNextLinkHeaders(t *testing.T) {
	calls := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Query().Get("page") == "1" {
			w.Header().Add("Link", "<http://"+r.Host+"/repositories/116313791/releases?page=2>; rel=\"next\"")
			w.Header().Add("Link", "<http://"+r.Host+"/repositories/116313791/releases?page=3>; rel=\"next\"")
		}
		fmt.Fprint(w, `[]`)
	}))
	defer s.Close()
	_, err := (GitHub{Client: s.Client(), BaseURL: s.URL}).Releases(context.Background())
	if err == nil || calls != 1 {
		t.Fatal(err, calls)
	}
}

func TestGitHubErrors(t *testing.T) {
	for _, tc := range []struct {
		status     int
		body, link string
	}{{429, `{}`, ""}, {200, `broken`, ""}, {200, `[]`, `<https://evil.invalid/next>; rel="next"`}, {200, `[]`, `</repositories/not-a-number/releases?page=2>; rel="next"`}, {200, `[]`, `</repos/Automattic/vip-cli/releases?page=1>; rel="next"`}} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Link", tc.link)
			w.WriteHeader(tc.status)
			fmt.Fprint(w, tc.body)
		}))
		_, err := (GitHub{Client: s.Client(), BaseURL: s.URL}).Releases(context.Background())
		s.Close()
		if err == nil {
			t.Errorf("accepted %+v", tc)
		}
	}
}

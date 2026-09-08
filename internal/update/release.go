// Package update discovers and installs standalone Go CLI releases.
package update

import (
	"fmt"
	"regexp"
	"strings"

	"golang.org/x/mod/semver"
)

type Channel string

const (
	Stable  Channel = "stable"
	Preview Channel = "preview"
)
const Repository = "Automattic/vip-cli"
const ReleasesURL = "https://github.com/" + Repository + "/releases"

type Platform struct{ OS, Arch string }
type Asset struct {
	Name   string `json:"name"`
	URL    string `json:"browser_download_url"`
	Digest string `json:"digest"`
	Size   int64  `json:"size"`
}
type Release struct {
	Tag        string  `json:"tag_name"`
	Draft      bool    `json:"draft"`
	Prerelease bool    `json:"prerelease"`
	Assets     []Asset `json:"assets"`
}
type Candidate struct {
	Version           string
	Archive, Checksum Asset
}

var releaseTag = regexp.MustCompile(`^5\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-(alpha|beta|rc)\.(0|[1-9][0-9]*))?$`)

func validVersion(v string) bool { return releaseTag.MatchString(v) && semver.IsValid("v"+v) }
func EffectiveChannel(installed string, explicit Channel) (Channel, error) {
	if !validVersion(installed) {
		return "", fmt.Errorf("%q is a development or unsupported build; install a release from %s", installed, ReleasesURL)
	}
	if explicit != "" {
		if explicit != Stable && explicit != Preview {
			return "", fmt.Errorf("channel must be stable or preview")
		}
		return explicit, nil
	}
	if strings.Contains(installed, "-") {
		return Preview, nil
	}
	return Stable, nil
}
func (p Platform) archiveName() (string, error) {
	switch p.OS + "/" + p.Arch {
	case "darwin/amd64", "darwin/arm64", "linux/amd64", "linux/arm64", "windows/amd64":
	default:
		return "", fmt.Errorf("updates are unavailable for %s/%s", p.OS, p.Arch)
	}
	return "vip-next-" + p.OS + "-" + p.Arch + ".tar.gz", nil
}
func (p Platform) names() (string, string) {
	s := ""
	if p.OS == "windows" {
		s = ".exe"
	}
	return "vip-next" + s, "go-search-replace" + s
}
func Select(installed string, channel Channel, p Platform, releases []Release) (*Candidate, error) {
	channel, err := EffectiveChannel(installed, channel)
	if err != nil {
		return nil, err
	}
	name, err := p.archiveName()
	if err != nil {
		return nil, err
	}
	var best *Candidate
	seen := map[string]bool{}
	for _, r := range releases {
		if r.Draft || !validVersion(r.Tag) {
			continue
		}
		if r.Prerelease != strings.Contains(r.Tag, "-") {
			return nil, fmt.Errorf("release %s has inconsistent prerelease metadata", r.Tag)
		}
		if seen[r.Tag] {
			return nil, fmt.Errorf("duplicate release %s", r.Tag)
		}
		seen[r.Tag] = true
		if channel == Stable && r.Prerelease || semver.Compare("v"+r.Tag, "v"+installed) <= 0 {
			continue
		}
		c := Candidate{Version: r.Tag}
		a, b := 0, 0
		for _, asset := range r.Assets {
			switch asset.Name {
			case name:
				c.Archive = asset
				a++
			case name + ".sha256":
				c.Checksum = asset
				b++
			}
		}
		if a > 1 || b > 1 {
			return nil, fmt.Errorf("release %s has duplicate update assets", r.Tag)
		}
		if a != 1 || b != 1 {
			continue
		}
		if best == nil || semver.Compare("v"+r.Tag, "v"+best.Version) > 0 {
			best = &c
		}
	}
	return best, nil
}

package update

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/Automattic/vip/internal/version"
)

type Request struct {
	CheckOnly       bool
	Channel         Channel
	ExplicitChannel bool
}
type Outcome struct {
	Installed, Available string
	Channel              Channel
	Updated              bool
	Instructions         string
	Warnings             []string
}
type Service struct {
	Installed  string
	Platform   Platform
	State      State
	Now        func() time.Time
	Executable func() (string, error)
	Fetch      func(context.Context) ([]Release, error)
	Stage      func(context.Context, Candidate, Platform, string) (Bundle, error)
	Installer  Installer
	initErr    error
}

func NewService() *Service {
	cache, e1 := os.UserCacheDir()
	config, e2 := os.UserConfigDir()
	s := &Service{Installed: version.Version, Platform: Platform{runtime.GOOS, runtime.GOARCH}, Now: time.Now, Executable: os.Executable, Fetch: (GitHub{}).Releases, Stage: (Downloader{}).Stage}
	s.State = State{CacheDir: filepath.Join(cache, "vip", "update"), ConfigDir: filepath.Join(config, "vip")}
	if e1 != nil {
		s.initErr = e1
	}
	if e2 != nil {
		s.initErr = e2
	}
	return s
}
func (s Service) Run(ctx context.Context, r Request, progress func(Step)) (out Outcome, err error) {
	out.Installed = s.Installed
	if s.initErr != nil {
		return out, s.initErr
	}
	if s.Now == nil {
		s.Now = time.Now
	}
	if progress == nil {
		progress = func(Step) {}
	}
	pref := r.Channel
	if !r.ExplicitChannel {
		pref, err = s.State.ReadChannel()
		if err != nil {
			return out, err
		}
	} else if pref != Stable && pref != Preview {
		return out, fmt.Errorf("channel must be stable or preview")
	}
	ch, err := EffectiveChannel(s.Installed, pref)
	if err != nil {
		return out, err
	}
	out.Channel = ch
	// Capture the destination before network discovery so another updater cannot
	// replace it during the check and leave this process using stale version data.
	var initial os.FileInfo
	if !r.CheckOnly && s.Executable != nil {
		path, e := s.Executable()
		if e != nil {
			return out, e
		}
		initial, e = fileIdentity(path)
		if e != nil {
			return out, e
		}
	}
	releases, err := s.Fetch(ctx)
	if err != nil {
		return out, err
	}
	candidate, err := Select(s.Installed, ch, s.Platform, releases)
	if err != nil {
		return out, err
	}
	_ = s.State.WriteCache(Cache{Schema: 1, Platform: s.Platform, Channel: ch, LastCheckedAt: s.Now(), Releases: releases})
	if candidate != nil {
		out.Available = candidate.Version
	}
	persist := func() error {
		if r.ExplicitChannel {
			if err := s.State.WriteChannel(ch); err != nil {
				return fmt.Errorf("could not save update channel: %w", err)
			}
		}
		return nil
	}
	if r.CheckOnly || candidate == nil {
		return out, persist()
	}
	exe, err := s.Executable()
	if err != nil {
		return out, err
	}
	l, err := ResolveLayout(exe, s.Platform)
	if err != nil {
		return out, err
	}
	expectedCLI, _ := s.Platform.names()
	if filepath.Base(l.CLI) != expectedCLI {
		return out, fmt.Errorf("executable has moved or was renamed; rerun the installed %s or install manually from %s", expectedCLI, ReleasesURL)
	}
	original, err := regularFile(l.CLI)
	if err != nil {
		return out, err
	}
	if initial != nil && !os.SameFile(initial, original) {
		return out, fmt.Errorf("installation changed during update; rerun the command")
	}
	inspect := s.Installer.InspectOwnership
	if inspect == nil {
		inspect = InspectOwnership
	}
	owner, err := inspect(ctx, l)
	if err != nil {
		return out, err
	}
	if owner.Managed {
		out.Instructions = owner.Instructions
		return out, nil
	}
	unlock, err := AcquireLock(l.CLI)
	if err != nil {
		return out, err
	}
	defer func() {
		if e := unlock(); e != nil {
			out.Warnings = append(out.Warnings, "Could not close updater lock: "+e.Error())
		}
	}()
	current, err := regularFile(l.CLI)
	if err != nil {
		return out, err
	}
	if !os.SameFile(original, current) {
		return out, fmt.Errorf("installation changed during update; rerun the command")
	}
	if err = s.Installer.cleanPrevious(l); err != nil {
		return out, err
	}
	progress(Step{Name: "Downloading " + candidate.Version})
	b, err := s.Stage(ctx, *candidate, s.Platform, filepath.Dir(l.CLI))
	if err != nil {
		return out, err
	}
	defer os.RemoveAll(b.Dir)
	progress(Step{Name: "Downloading " + candidate.Version, Done: true})
	progress(Step{Name: "Verifying download", Done: true})
	installed, err := s.Installer.Apply(ctx, l, b, progress)
	if err != nil {
		return out, err
	}
	out.Updated = true
	out.Warnings = append(out.Warnings, installed.Warnings...)
	if os.Getenv("VIP_SEARCH_REPLACE_BIN") != "" {
		out.Warnings = append(out.Warnings, "Bundled go-search-replace updated; VIP_SEARCH_REPLACE_BIN still selects your override.")
	}
	if err = persist(); err != nil {
		out.Warnings = append(out.Warnings, err.Error())
		return out, nil
	}
	return out, nil
}

// fileIdentity captures the ID immediately. On Windows, os.Stat defers reading
// the ID until os.SameFile, which may run after the path has been replaced.
func fileIdentity(path string) (os.FileInfo, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return f.Stat()
}

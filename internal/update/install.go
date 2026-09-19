package update

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

type Layout struct{ CLI, Helper string }
type Ownership struct {
	Managed      bool
	Instructions string
}
type Step struct {
	Name string
	Done bool
}
type InstallResult struct{ Warnings []string }
type Installer struct {
	Rename           func(string, string) error
	Remove           func(string) error
	InspectOwnership func(context.Context, Layout) (Ownership, error)
}
type replacement struct {
	Target, New, Backup string
	moved, placed       bool
}
type installMarker struct {
	ID       string
	Complete bool
	Files    []replacement
}

func markerPath(l Layout) string {
	return filepath.Join(filepath.Dir(l.CLI), "."+filepath.Base(l.CLI)+".update.json")
}
func ResolveLayout(exe string, p Platform) (Layout, error) {
	real, err := filepath.EvalSymlinks(exe)
	if err != nil {
		return Layout{}, err
	}
	real, err = filepath.Abs(real)
	if err != nil {
		return Layout{}, err
	}
	if _, err = regularFile(real); err != nil {
		return Layout{}, err
	}
	_, helper := p.names()
	for _, candidate := range []string{filepath.Join(filepath.Dir(real), "bin", helper), filepath.Join(filepath.Dir(real), helper)} {
		if _, err := os.Lstat(candidate); os.IsNotExist(err) {
			continue
		}
		if _, err := regularFile(candidate); err != nil {
			return Layout{}, err
		}
		// Parent symlinks can lead outside the bundle; accept only a real bundled directory.
		dir, err := filepath.EvalSymlinks(filepath.Dir(candidate))
		if err != nil || dir != filepath.Dir(candidate) {
			return Layout{}, fmt.Errorf("ambiguous bundled helper directory; install manually from %s", ReleasesURL)
		}
		if candidate == real {
			return Layout{}, fmt.Errorf("CLI and helper refer to the same file")
		}
		return Layout{real, candidate}, nil
	}
	return Layout{}, fmt.Errorf("bundled go-search-replace not found; install the complete archive from %s", ReleasesURL)
}
func regularFile(path string) (os.FileInfo, error) {
	s, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !s.Mode().IsRegular() {
		return nil, fmt.Errorf("%s is not a regular file", path)
	}
	return s, nil
}
func (i Installer) Apply(ctx context.Context, l Layout, b Bundle, progress func(Step)) (res InstallResult, err error) {
	if i.Rename == nil {
		i.Rename = os.Rename
	}
	if i.Remove == nil {
		i.Remove = os.Remove
	}
	if i.InspectOwnership == nil {
		i.InspectOwnership = InspectOwnership
	}
	if progress == nil {
		progress = func(Step) {}
	}
	if err = ctx.Err(); err != nil {
		return res, err
	}
	if err = i.cleanPrevious(l); err != nil {
		return res, err
	}
	owner, err := i.InspectOwnership(ctx, l)
	if err != nil {
		return res, err
	}
	if owner.Managed {
		return res, fmt.Errorf("%s", owner.Instructions)
	}
	m := installMarker{ID: uuid.NewString()}
	markerWritten := false
	defer func() {
		if !markerWritten {
			for _, r := range m.Files {
				_ = os.Remove(r.New)
			}
		}
	}()
	for idx, target := range []string{l.CLI, l.Helper} {
		stat, e := regularFile(target)
		if e != nil {
			return res, e
		}
		source := b.CLI
		if idx == 1 {
			source = b.Helper
		}
		prefix := filepath.Join(filepath.Dir(target), "."+filepath.Base(target)+".vip-update-"+m.ID)
		r := replacement{Target: target, New: prefix + "-new", Backup: prefix + "-old"}
		if err = copyExclusive(source, r.New, stat.Mode().Perm()); err != nil {
			for _, f := range m.Files {
				os.Remove(f.New)
			}
			return res, err
		}
		m.Files = append(m.Files, r)
	}
	if err = writeJSON(markerPath(l), m); err != nil {
		for _, f := range m.Files {
			os.Remove(f.New)
		}
		return res, err
	}
	markerWritten = true
	// Preserve this marker on abrupt termination or failed restoration.
	for index := range m.Files {
		r := &m.Files[index]
		if err = ctx.Err(); err != nil {
			break
		}
		progress(Step{Name: "Updating " + filepath.Base(r.Target)})
		if err = i.Rename(r.Target, r.Backup); err != nil {
			break
		}
		r.moved = true
		if err = i.Rename(r.New, r.Target); err != nil {
			break
		}
		r.placed = true
		progress(Step{Name: "Updating " + filepath.Base(r.Target), Done: true})
	}
	if err != nil {
		original := err
		var recovery []error
		for index := len(m.Files) - 1; index >= 0; index-- {
			r := &m.Files[index]
			if !r.moved {
				continue
			}
			if r.placed {
				if e := i.Rename(r.Target, r.New); e != nil {
					recovery = append(recovery, fmt.Errorf("cannot move failed replacement %s; original at %s: %w", r.Target, r.Backup, e))
					continue
				}
			}
			if e := i.Rename(r.Backup, r.Target); e != nil {
				recovery = append(recovery, fmt.Errorf("restore %s from %s: %w", r.Target, r.Backup, e))
			}
		}
		if len(recovery) == 0 {
			for _, r := range m.Files {
				os.Remove(r.New)
			}
			os.Remove(markerPath(l))
			return res, fmt.Errorf("update failed; original files restored: %w", original)
		}
		return res, errors.Join(append([]error{fmt.Errorf("update failed; manual recovery required (%s): %w", markerPath(l), original)}, recovery...)...)
	}
	m.Complete = true
	if err = writeJSON(markerPath(l), m); err != nil {
		res.Warnings = append(res.Warnings, "Files updated, but could not mark cleanup complete: "+markerPath(l))
		return res, nil
	}
	if err = i.cleanPrevious(l); err != nil {
		res.Warnings = append(res.Warnings, err.Error())
	}
	if err = os.RemoveAll(b.Dir); err != nil {
		res.Warnings = append(res.Warnings, "Could not remove update staging: "+b.Dir)
	}
	return res, nil
}
func copyExclusive(source, target string, mode os.FileMode) (err error) {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			os.Remove(target)
		}
	}()
	_, err = io.Copy(out, in)
	closeErr := out.Close()
	if err != nil {
		return err
	}
	return closeErr
}
func (i Installer) cleanPrevious(l Layout) error {
	var m installMarker
	err := readJSON(markerPath(l), 8192, &m)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("unreadable update recovery record %s: %w", markerPath(l), err)
	}
	if !m.Complete {
		return fmt.Errorf("incomplete update; inspect recovery record %s before retrying", markerPath(l))
	}
	if _, err = uuid.Parse(m.ID); err != nil || len(m.Files) != 2 {
		return fmt.Errorf("invalid update recovery record")
	}
	for idx, r := range m.Files {
		target := l.CLI
		if idx == 1 {
			target = l.Helper
		}
		prefix := filepath.Join(filepath.Dir(target), "."+filepath.Base(target)+".vip-update-"+m.ID)
		if r.Target != target || r.Backup != prefix+"-old" || r.New != prefix+"-new" || strings.Contains(m.ID, "/") {
			return fmt.Errorf("invalid update recovery paths")
		}
		for _, p := range []string{r.New, r.Backup} {
			if _, e := regularFile(p); os.IsNotExist(e) {
				continue
			} else if e != nil {
				return e
			}
			remove := i.Remove
			if remove == nil {
				remove = os.Remove
			}
			if e := remove(p); e != nil {
				return fmt.Errorf("updated files are installed; cannot yet remove backup %s: %w", p, e)
			}
		}
	}
	return os.Remove(markerPath(l))
}

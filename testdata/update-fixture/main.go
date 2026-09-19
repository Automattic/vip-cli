// This executable is built only by native updater integration tests.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/Automattic/vip/internal/update"
)

var fixtureVersion = "unset"

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		fmt.Println(fixtureVersion)
		return
	}
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) != 5 {
		return errors.New("expected apply or rollback and staged bundle paths")
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return err
	}
	suffix := ""
	if runtime.GOOS == "windows" {
		suffix = ".exe"
	}
	l := update.Layout{CLI: exe, Helper: filepath.Join(filepath.Dir(exe), "go-search-replace"+suffix)}
	b := update.Bundle{Dir: os.Args[2], CLI: os.Args[3], Helper: os.Args[4]}
	unlock, err := update.AcquireLock(exe)
	if err != nil {
		return err
	}
	i := update.Installer{InspectOwnership: func(context.Context, update.Layout) (update.Ownership, error) { return update.Ownership{}, nil }}
	if os.Args[1] == "rollback" {
		calls := 0
		i.Rename = func(a, z string) error {
			calls++
			if calls == 4 {
				return errors.New("injected helper replacement failure")
			}
			return os.Rename(a, z)
		}
	}
	_, err = i.Apply(context.Background(), l, b, func(s update.Step) { fmt.Println(s.Name, s.Done) })
	return errors.Join(err, unlock())
}

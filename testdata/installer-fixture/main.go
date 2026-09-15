// Tiny runnable payload for disposable native installer lifecycle tests.
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/Automattic/vip/internal/update"
)

var fixtureVersion = "fixture"

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		fmt.Println(fixtureVersion)
		return
	}
	if len(os.Args) == 2 && os.Args[1] == "--installer-owner" {
		exe, err := os.Executable()
		if err != nil {
			panic(err)
		}
		helper := "go-search-replace"
		if runtime.GOOS == "windows" {
			helper += ".exe"
		}
		owner, err := update.InspectOwnership(context.Background(), update.Layout{CLI: exe, Helper: filepath.Join(filepath.Dir(exe), helper)})
		if err != nil || !owner.Managed {
			fmt.Fprintln(os.Stderr, "installer ownership missing:", err)
			os.Exit(1)
		}
		fmt.Println(owner.Instructions)
		return
	}
	fmt.Fprintln(os.Stderr, "expected --version or --installer-owner")
	os.Exit(1)
}
